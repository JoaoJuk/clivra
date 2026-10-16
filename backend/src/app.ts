import { hkdfSync } from 'node:crypto';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { serializerCompiler, validatorCompiler } from '@fastify/type-provider-zod';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { z } from 'zod';
import type { Config } from './config.js';
import type { Database } from './db/client.js';
import { errors } from './lib/errors.js';
import { newId } from './lib/ids.js';
import { serializeErrorSafely } from './lib/log.js';
import { createAdminGuard, createAuthGuard } from './plugins/auth-guard.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { createAdminService } from './services/admin.js';
import { createAuthService } from './services/auth.js';
import { createEmailCodeService } from './services/email-codes.js';
import { createSmtpMailer, type Mailer } from './services/mailer.js';
import { createAccessTokens } from './services/tokens.js';

// Mensagens de validação do Zod em português (o contrato pede `message` em pt-BR).
z.config(z.locales.pt());

// P4: o log nunca leva query string (pode ter busca por estabelecimento/valor),
// corpo, cookie, Authorization nem mensagem/parâmetros de erro de banco.
const logger: FastifyServerOptions['logger'] = {
  level: 'info',
  serializers: {
    err: serializeErrorSafely,
    req: (request: { method: string; url: string; id: string }) => ({
      id: request.id,
      method: request.method,
      path: request.url.split('?')[0],
    }),
  },
};

// `mailer` permite trocar o SMTP por um falso nos testes.
export async function buildApp(config: Config, database: Database, overrides: { mailer?: Mailer } = {}) {
  const trustedHops = config.TRUST_PROXY;
  const app = Fastify({
    logger: config.NODE_ENV === 'test' ? false : logger,
    genReqId: () => newId(),
    requestIdHeader: false,
    // N = confia só nos N saltos mais próximos (Caddy, Vercel); o resto do XFF é ignorado.
    trustProxy: typeof trustedHops === 'number' ? (_address: string, hop: number) => hop < trustedHops : trustedHops,
    bodyLimit: 64 * 1024,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);

  // `Content-Type: application/json` com corpo vazio vira `null` em vez de 400
  // (ex.: refresh só com cookie). O parser padrão do Fastify continua barrando
  // __proto__/constructor (prototype poisoning).
  const defaultJsonParser = app.getDefaultJsonParser('error', 'error');
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    const text = body.toString();
    if (text === '') return done(null, null);
    return defaultJsonParser(request, text, done);
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
    // Respostas com token e dado financeiro nunca ficam em cache (navegador/proxy).
    reply.header('cache-control', 'no-store');
  });

  await app.register(helmet, {
    // API só devolve JSON: nada pode ser carregado nem embutido a partir dela.
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  await app.register(cors, {
    origin: config.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    exposedHeaders: ['Retry-After', 'Content-Disposition', 'X-Request-Id'],
    maxAge: 600,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    errorResponseBuilder: () => errors.rateLimited(),
  });

  const accessTokens = createAccessTokens(config.JWT_SECRET, config.ACCESS_TOKEN_TTL_SECONDS);
  const mailer =
    overrides.mailer ??
    (config.SMTP_USER && config.SMTP_PASS
      ? createSmtpMailer({
          host: config.SMTP_HOST,
          port: config.SMTP_PORT,
          user: config.SMTP_USER,
          pass: config.SMTP_PASS,
          from: config.MAIL_FROM ?? `Clivra <${config.SMTP_USER}>`,
        })
      : undefined);
  const emailCodes = mailer
    ? createEmailCodeService({
        db: database.db,
        mailer,
        // Subchave própria (HKDF): o JWT_SECRET não serve direto a dois propósitos.
        secret: Buffer.from(hkdfSync('sha256', config.JWT_SECRET, '', 'clivra/email-code', 32)),
        onBackgroundError: (error) => app.log.error({ err: error }, 'falha ao gerar/enviar código por e-mail'),
      })
    : undefined;
  const auth = createAuthService({
    db: database.db,
    accessTokens,
    refreshTtlDays: config.REFRESH_TOKEN_TTL_DAYS,
    ownerSetupCode: config.OWNER_SETUP_CODE,
    production: config.NODE_ENV === 'production',
    emailCodes,
  });
  const requireAuth = createAuthGuard(auth);
  const requireAdmin = createAdminGuard(requireAuth);
  const admin = createAdminService({
    db: database.db,
    mailer,
    appUrl: config.APP_URL,
    onBackgroundError: (error) => app.log.error({ err: error }, 'falha ao enviar e-mail de convite'),
  });

  await app.register(healthRoutes, { database });
  await app.register(authRoutes, { auth, requireAuth, cookieSecure: config.COOKIE_SECURE });
  await app.register(adminRoutes, { admin, requireAdmin });

  return app;
}

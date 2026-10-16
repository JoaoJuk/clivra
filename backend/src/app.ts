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
import { createAuthGuard } from './plugins/auth-guard.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { createAuthService } from './services/auth.js';
import { createAccessTokens } from './services/tokens.js';

// Mensagens de validação do Zod em português (o contrato pede `message` em pt-BR).
z.config(z.locales.pt());

// P4: o log nunca leva query string (pode ter busca por estabelecimento/valor),
// corpo, cookie nem Authorization.
const logger: FastifyServerOptions['logger'] = {
  level: 'info',
  serializers: {
    req: (request: { method: string; url: string; id: string }) => ({
      id: request.id,
      method: request.method,
      path: request.url.split('?')[0],
    }),
  },
};

export async function buildApp(config: Config, database: Database) {
  const app = Fastify({
    logger: config.NODE_ENV === 'test' ? false : logger,
    genReqId: () => newId(),
    requestIdHeader: false,
    trustProxy: config.TRUST_PROXY,
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
  const auth = createAuthService({ db: database.db, accessTokens, refreshTtlDays: config.REFRESH_TOKEN_TTL_DAYS });
  const requireAuth = createAuthGuard(auth);

  await app.register(healthRoutes, { database });
  await app.register(authRoutes, { auth, requireAuth, cookieSecure: config.COOKIE_SECURE });

  return app;
}

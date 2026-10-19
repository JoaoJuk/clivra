import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { errors } from '../lib/errors.js';
import type { AuthService, Session } from '../services/auth.js';
import { EMAIL_CODE_RESEND_SECONDS, EMAIL_CODE_TTL_SECONDS } from '../services/email-codes.js';

export const REFRESH_COOKIE = 'clivra_rt';

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
// Formato não é validado aqui: código malformado dá INVALID_EMAIL_CODE no
// serviço, igual a código errado (contrato §1).
const emailCode = z.string().trim().max(32);
const newPassword = z.string().min(8).max(128);

const registerBody = z.object({
  email,
  password: newPassword,
  // Sem quebra de linha/caracteres de controle: o nome aparece nas confirmações do painel admin.
  name: z.string().trim().min(1).max(80).regex(/^[^\p{Cc}]+$/u, 'O nome não pode ter quebras de linha.'),
  // Exigido quando o servidor tem OWNER_SETUP_CODE (sempre em produção).
  setupCode: z.string().max(200).optional(),
  // Exigido quando o servidor envia e-mail (SMTP configurado).
  emailCode: emailCode.optional(),
});

const emailCodeBody = z.object({
  email,
  purpose: z.enum(['register', 'password_reset']),
  setupCode: z.string().max(200).optional(),
});

const emailCodeResponse = z.object({ expiresIn: z.number().int(), resendIn: z.number().int() });

const passwordResetBody = z.object({ email, emailCode, newPassword });

const loginBody = z.object({
  email,
  password: z.string().min(1).max(128),
});

// Sem corpo = token vem do cookie (P-13). Com corpo = contrato v1 atual.
const refreshBody = z.object({ refreshToken: z.string().min(1).max(512).optional() }).nullish();

const publicUser = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.enum(['admin', 'member']),
  createdAt: z.string(),
});

// Schema de resposta = lista do que pode sair. Campo fora daqui não é enviado.
const sessionResponse = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int(),
  user: publicUser.omit({ createdAt: true }),
});

interface AuthRouteOptions {
  auth: AuthService;
  requireAuth: (request: FastifyRequest) => Promise<void>;
  cookieSecure: boolean;
}

export async function authRoutes(app: FastifyInstance, opts: AuthRouteOptions): Promise<void> {
  const { auth, requireAuth } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();

  const cookieOptions = {
    httpOnly: true,
    secure: opts.cookieSecure,
    sameSite: 'strict' as const,
    path: '/v1/auth',
  };

  function sendSession(reply: FastifyReply, session: Session, statusCode: number) {
    reply.setCookie(REFRESH_COOKIE, session.refreshToken, {
      ...cookieOptions,
      maxAge: Math.floor(auth.refreshTtlMs / 1000),
    });
    return reply.status(statusCode).send(session);
  }

  // Token do corpo ou do cookie. Com cookie, recusa pedido vindo de outro site
  // (CSRF): o SameSite=Strict já barra, isto é a segunda camada — o sslip.io
  // não separa os sites da VPS como a Public Suffix List separa os da Vercel.
  function findRefreshToken(request: FastifyRequest, body: z.infer<typeof refreshBody>): string | undefined {
    if (body?.refreshToken) return body.refreshToken;
    const token = request.cookies[REFRESH_COOKIE];
    const site = request.headers['sec-fetch-site'];
    if (token && (site === 'cross-site' || site === 'same-site')) throw errors.crossSite();
    return token;
  }

  function readRefreshToken(request: FastifyRequest, body: z.infer<typeof refreshBody>): string {
    const token = findRefreshToken(request, body);
    if (!token) throw errors.invalidRefreshToken();
    return token;
  }

  r.post(
    '/v1/auth/register',
    {
      schema: { body: registerBody, response: { 201: sessionResponse } },
      config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
    },
    async (request, reply) => sendSession(reply, await auth.register(request.body), 201),
  );

  r.get(
    '/v1/auth/registration',
    { schema: { response: { 200: z.object({ mode: z.enum(['owner_setup', 'invite_only']) }) } } },
    async () => ({ mode: await auth.registrationMode() }),
  );

  r.post(
    '/v1/auth/email-code',
    {
      schema: { body: emailCodeBody, response: { 202: emailCodeResponse } },
      config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    },
    async (request, reply) => {
      await auth.requestEmailCode(request.body);
      return reply.status(202).send({ expiresIn: EMAIL_CODE_TTL_SECONDS, resendIn: EMAIL_CODE_RESEND_SECONDS });
    },
  );

  r.post(
    '/v1/auth/password-reset',
    {
      schema: { body: passwordResetBody },
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    },
    async (request, reply) => {
      await auth.resetPassword(request.body);
      // A sessão deste aparelho também caiu: o front volta para o login.
      reply.clearCookie(REFRESH_COOKIE, cookieOptions);
      return reply.status(204).send();
    },
  );

  r.post(
    '/v1/auth/login',
    {
      schema: { body: loginBody, response: { 200: sessionResponse } },
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    },
    async (request, reply) => sendSession(reply, await auth.login(request.body, request.clientIp), 200),
  );

  r.post(
    '/v1/auth/refresh',
    {
      schema: { body: refreshBody, response: { 200: sessionResponse } },
      config: { rateLimit: { max: 60, timeWindow: '15 minutes' } },
    },
    async (request, reply) => {
      const token = readRefreshToken(request, request.body);
      try {
        return sendSession(reply, await auth.refresh(token), 200);
      } catch (error) {
        reply.clearCookie(REFRESH_COOKIE, cookieOptions);
        throw error;
      }
    },
  );

  r.post(
    '/v1/auth/logout',
    { schema: { body: refreshBody }, config: { rateLimit: { max: 30, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const token = findRefreshToken(request, request.body);
      if (token) await auth.logout(token);
      reply.clearCookie(REFRESH_COOKIE, cookieOptions);
      return reply.status(204).send();
    },
  );

  r.get(
    '/v1/auth/me',
    { schema: { response: { 200: publicUser } }, preHandler: requireAuth },
    async (request) => auth.me(request.userId),
  );
}

import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { errors } from '../lib/errors.js';
import type { AuthService, Session } from '../services/auth.js';

export const REFRESH_COOKIE = 'clivra_rt';

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));

const registerBody = z.object({
  email,
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(80),
  // Exigido quando o servidor tem OWNER_SETUP_CODE (sempre em produção).
  setupCode: z.string().max(200).optional(),
});

const loginBody = z.object({
  email,
  password: z.string().min(1).max(128),
});

// Sem corpo = token vem do cookie (P-13). Com corpo = contrato v1 atual.
const refreshBody = z.object({ refreshToken: z.string().min(1).max(512).optional() }).nullish();

const publicUser = z.object({ id: z.string(), email: z.string(), name: z.string(), createdAt: z.string() });

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

  function readRefreshToken(request: FastifyRequest, body: z.infer<typeof refreshBody>): string {
    const token = body?.refreshToken ?? request.cookies[REFRESH_COOKIE];
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

  r.post(
    '/v1/auth/login',
    {
      schema: { body: loginBody, response: { 200: sessionResponse } },
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    },
    async (request, reply) => sendSession(reply, await auth.login(request.body, request.ip), 200),
  );

  r.post(
    '/v1/auth/refresh',
    {
      schema: { body: refreshBody, response: { 200: sessionResponse } },
      config: { rateLimit: { max: 60, timeWindow: '15 minutes' } },
    },
    async (request, reply) => {
      try {
        return sendSession(reply, await auth.refresh(readRefreshToken(request, request.body)), 200);
      } catch (error) {
        reply.clearCookie(REFRESH_COOKIE, cookieOptions);
        throw error;
      }
    },
  );

  r.post('/v1/auth/logout', { schema: { body: refreshBody } }, async (request, reply) => {
    const token = request.body?.refreshToken ?? request.cookies[REFRESH_COOKIE];
    if (token) await auth.logout(token);
    reply.clearCookie(REFRESH_COOKIE, cookieOptions);
    return reply.status(204).send();
  });

  r.get(
    '/v1/auth/me',
    { schema: { response: { 200: publicUser } }, preHandler: requireAuth },
    async (request) => auth.me(request.userId),
  );
}

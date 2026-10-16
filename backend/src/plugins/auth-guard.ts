import type { FastifyRequest } from 'fastify';
import { errors } from '../lib/errors.js';
import type { AuthService } from '../services/auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
}

// preHandler das rotas protegidas: exige `Authorization: Bearer <accessToken>`.
export function createAuthGuard(auth: AuthService) {
  return async function requireAuth(request: FastifyRequest): Promise<void> {
    const header = request.headers.authorization;
    const match = header ? /^Bearer ([^\s]+)$/.exec(header) : null;
    if (!match?.[1]) throw errors.unauthenticated();
    request.userId = await auth.authenticate(match[1]);
  };
}

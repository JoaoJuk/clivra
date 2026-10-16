import type { FastifyRequest } from 'fastify';
import type { UserRole } from '../db/schema.js';
import { errors } from '../lib/errors.js';
import type { AuthService } from '../services/auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
    userRole: UserRole;
  }
}

// preHandler das rotas protegidas: exige `Authorization: Bearer <accessToken>`.
export function createAuthGuard(auth: AuthService) {
  return async function requireAuth(request: FastifyRequest): Promise<void> {
    const header = request.headers.authorization;
    const match = header ? /^Bearer ([^\s]+)$/.exec(header) : null;
    if (!match?.[1]) throw errors.unauthenticated();
    const context = await auth.authenticate(match[1]);
    request.userId = context.userId;
    request.userRole = context.role;
  };
}

// preHandler das rotas /v1/admin: autenticado E admin.
export function createAdminGuard(requireAuth: (request: FastifyRequest) => Promise<void>) {
  return async function requireAdmin(request: FastifyRequest): Promise<void> {
    await requireAuth(request);
    if (request.userRole !== 'admin') throw errors.adminOnly();
  };
}

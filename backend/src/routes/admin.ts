import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AdminService } from '../services/admin.js';

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const idParams = z.object({ id: z.uuid() });

// Schema de resposta = lista do que pode sair: nada de dado financeiro (D16).
const adminUser = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.enum(['admin', 'member']),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable(),
  disabledAt: z.string().nullable(),
  activeSessions: z.number().int(),
});

const adminInvite = z.object({ id: z.string(), email: z.string(), createdAt: z.string(), expiresAt: z.string() });

interface AdminRouteOptions {
  admin: AdminService;
  requireAdmin: (request: FastifyRequest) => Promise<void>;
}

export async function adminRoutes(app: FastifyInstance, opts: AdminRouteOptions): Promise<void> {
  const { admin, requireAdmin } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/v1/admin/users',
    { schema: { response: { 200: z.object({ data: z.array(adminUser) }) } }, preHandler: requireAdmin },
    async () => ({ data: await admin.listUsers() }),
  );

  r.post(
    '/v1/admin/users/:id/disable',
    { schema: { params: idParams }, preHandler: requireAdmin },
    async (request, reply) => {
      await admin.disableUser(request.userId, request.params.id);
      return reply.status(204).send();
    },
  );

  r.post(
    '/v1/admin/users/:id/enable',
    { schema: { params: idParams }, preHandler: requireAdmin },
    async (request, reply) => {
      await admin.enableUser(request.userId, request.params.id);
      return reply.status(204).send();
    },
  );

  r.post(
    '/v1/admin/users/:id/revoke-sessions',
    { schema: { params: idParams }, preHandler: requireAdmin },
    async (request, reply) => {
      await admin.revokeSessions(request.params.id);
      return reply.status(204).send();
    },
  );

  r.get(
    '/v1/admin/invites',
    { schema: { response: { 200: z.object({ data: z.array(adminInvite) }) } }, preHandler: requireAdmin },
    async () => ({ data: await admin.listInvites() }),
  );

  r.post(
    '/v1/admin/invites',
    {
      schema: { body: z.object({ email }), response: { 201: adminInvite } },
      preHandler: requireAdmin,
      // Cada convite dispara um e-mail.
      config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
    },
    async (request, reply) => reply.status(201).send(await admin.invite(request.userId, request.body.email)),
  );

  r.delete(
    '/v1/admin/invites/:id',
    { schema: { params: idParams }, preHandler: requireAdmin },
    async (request, reply) => {
      await admin.revokeInvite(request.params.id);
      return reply.status(204).send();
    },
  );
}

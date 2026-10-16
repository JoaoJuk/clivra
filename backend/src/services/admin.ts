import type { Db } from '../db/client.js';
import { listActiveInvites, replaceInvite, revokeInvite } from '../db/invites.js';
import { revokeAllForUser } from '../db/refresh-tokens.js';
import type { InviteRow } from '../db/schema.js';
import { cutSessions, findUserByEmail, findUserById, listUsersWithSessions, setUserDisabled } from '../db/users.js';
import { errors } from '../lib/errors.js';
import { newId, toIso } from '../lib/ids.js';
import type { Mailer } from './mailer.js';

export const INVITE_TTL_DAYS = 7;

// Painel do admin (D16): só dados de CONTA dos familiares — nunca cartões,
// valores ou estabelecimentos.
export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'member';
  createdAt: string;
  lastLoginAt: string | null;
  disabledAt: string | null;
  activeSessions: number;
}

export interface AdminInvite {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
}

function toAdminInvite(row: InviteRow): AdminInvite {
  return { id: row.id, email: row.email, createdAt: toIso(row.createdAt), expiresAt: toIso(row.expiresAt) };
}

export function createAdminService(deps: {
  db: Db;
  // undefined = sem SMTP: convite não tem como chegar, então fica desligado.
  mailer: Mailer | undefined;
  // Endereço do app no texto do convite (opcional).
  appUrl: string | undefined;
  onBackgroundError: (error: unknown) => void;
}) {
  const { db } = deps;

  async function targetMember(adminId: string, userId: string) {
    if (userId === adminId) throw errors.cannotChangeSelf();
    const user = await findUserById(db, userId);
    if (!user) throw errors.notFound();
    return user;
  }

  async function dropSessions(userId: string): Promise<void> {
    // Corte antes da revogação (mesma ordem do resetPassword).
    await cutSessions(db, userId);
    await revokeAllForUser(db, userId, new Date());
  }

  return {
    async listUsers(): Promise<AdminUser[]> {
      const rows = await listUsersWithSessions(db, new Date());
      return rows.map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        createdAt: toIso(row.createdAt),
        lastLoginAt: row.lastLoginAt ? toIso(row.lastLoginAt) : null,
        disabledAt: row.disabledAt ? toIso(row.disabledAt) : null,
        activeSessions: row.activeSessions,
      }));
    },

    async listInvites(): Promise<AdminInvite[]> {
      return (await listActiveInvites(db, new Date())).map(toAdminInvite);
    },

    async invite(adminId: string, email: string): Promise<AdminInvite> {
      const { mailer } = deps;
      if (!mailer) throw errors.emailDisabled();
      if (await findUserByEmail(db, email)) throw errors.emailTaken();
      const admin = await findUserById(db, adminId);
      if (!admin) throw errors.unauthenticated();
      const now = new Date();
      const row = await replaceInvite(
        db,
        { id: newId(), email, invitedBy: adminId, expiresAt: new Date(now.getTime() + INVITE_TTL_DAYS * 86_400_000) },
        now,
      );
      const where = deps.appUrl ? `Abra ${deps.appUrl}` : 'Abra o app Clivra';
      mailer
        .send({
          to: email,
          subject: `${admin.name} convidou você para o Clivra`,
          text:
            `${admin.name} convidou você para usar o Clivra, o controle de gastos de cartão da família.\n\n` +
            `${where}, toque em "Criar conta" e use este e-mail (${email}). ` +
            'Você vai receber um código de confirmação.\n\n' +
            `O convite vale por ${INVITE_TTL_DAYS} dias. Seus gastos ficam visíveis só para você.\n\n` +
            'Se você não esperava este convite, ignore este e-mail.\n',
        })
        .catch(deps.onBackgroundError);
      return toAdminInvite(row);
    },

    async revokeInvite(inviteId: string): Promise<void> {
      if (!(await revokeInvite(db, inviteId, new Date()))) throw errors.notFound();
    },

    async disableUser(adminId: string, userId: string): Promise<void> {
      await targetMember(adminId, userId);
      await setUserDisabled(db, userId, true);
      await revokeAllForUser(db, userId, new Date());
    },

    async enableUser(adminId: string, userId: string): Promise<void> {
      await targetMember(adminId, userId);
      await setUserDisabled(db, userId, false);
    },

    // Desconecta todos os aparelhos da pessoa (inclusive do próprio admin).
    async revokeSessions(userId: string): Promise<void> {
      if (!(await findUserById(db, userId))) throw errors.notFound();
      await dropSessions(userId);
    },
  };
}

export type AdminService = ReturnType<typeof createAdminService>;

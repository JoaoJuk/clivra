import { and, desc, eq, gt, isNull, lt } from 'drizzle-orm';
import type { Db } from './client.js';
import { invites, type InviteRow } from './schema.js';

const isActive = (now: Date) => and(isNull(invites.acceptedAt), isNull(invites.revokedAt), gt(invites.expiresAt, now));

// Revoga convites ativos do mesmo e-mail e cria o novo: só o último vale.
export async function replaceInvite(
  db: Db,
  input: { id: string; email: string; invitedBy: string; expiresAt: Date },
  now: Date,
): Promise<InviteRow> {
  return db.transaction(async (tx) => {
    await tx.update(invites).set({ revokedAt: now }).where(and(eq(invites.email, input.email), isActive(now)));
    const [row] = await tx.insert(invites).values(input).returning();
    if (!row) throw new Error('insert em invites não retornou linha');
    return row;
  });
}

export async function findActiveInvite(db: Db, email: string, now: Date): Promise<InviteRow | undefined> {
  const [row] = await db
    .select()
    .from(invites)
    .where(and(eq(invites.email, email), isActive(now)))
    .orderBy(desc(invites.createdAt))
    .limit(1);
  return row;
}

export async function listActiveInvites(db: Db, now: Date): Promise<InviteRow[]> {
  return db.select().from(invites).where(isActive(now)).orderBy(desc(invites.createdAt));
}

// false = convite inexistente ou já usado/revogado/vencido.
export async function revokeInvite(db: Db, id: string, now: Date): Promise<boolean> {
  const rows = await db
    .update(invites)
    .set({ revokedAt: now })
    .where(and(eq(invites.id, id), isActive(now)))
    .returning({ id: invites.id });
  return rows.length > 0;
}

// Marca como aceito só se ainda estiver ativo (atômico).
export async function acceptInvite(db: Db, id: string, now: Date): Promise<boolean> {
  const rows = await db
    .update(invites)
    .set({ acceptedAt: now })
    .where(and(eq(invites.id, id), isActive(now)))
    .returning({ id: invites.id });
  return rows.length > 0;
}

// Convite não aceito e vencido há tempo (o aceito fica: mostra quem convidou quem).
export async function deleteStaleInvites(db: Db, before: Date): Promise<void> {
  await db.delete(invites).where(and(isNull(invites.acceptedAt), lt(invites.expiresAt, before)));
}

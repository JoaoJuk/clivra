import { and, count, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Db } from './client.js';
import { refreshTokens, users, type UserRole, type UserRow } from './schema.js';

export async function findUserByEmail(db: Db, email: string): Promise<UserRow | undefined> {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row;
}

export async function findUserById(db: Db, id: string): Promise<UserRow | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row;
}

export async function hasAnyUser(db: Db): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).limit(1);
  return row !== undefined;
}

export async function insertUser(
  db: Db,
  input: { id: string; email: string; name: string; passwordHash: string; role: UserRole },
): Promise<UserRow> {
  const [row] = await db.insert(users).values(input).returning();
  if (!row) throw new Error('insert em users não retornou linha');
  return row;
}

// Troca a senha e marca o corte das sessões com o relógio do banco (o mesmo
// que preenche refresh_tokens.created_at).
export async function updatePasswordAndCutSessions(db: Db, id: string, passwordHash: string): Promise<void> {
  await db.update(users).set({ passwordHash, sessionsValidAfter: sql`now()` }).where(eq(users.id, id));
}

// Corta as sessões sem trocar a senha (bloqueio, "derrubar sessões").
export async function cutSessions(db: Db, id: string): Promise<void> {
  await db.update(users).set({ sessionsValidAfter: sql`now()` }).where(eq(users.id, id));
}

export async function setUserDisabled(db: Db, id: string, disabled: boolean): Promise<void> {
  await db
    .update(users)
    .set(disabled ? { disabledAt: sql`now()`, sessionsValidAfter: sql`now()` } : { disabledAt: null })
    .where(eq(users.id, id));
}

export async function touchLastLogin(db: Db, id: string): Promise<void> {
  await db.update(users).set({ lastLoginAt: sql`now()` }).where(eq(users.id, id));
}

// Lista para o painel do admin: só dados de conta, nunca dado financeiro.
export async function listUsersWithSessions(db: Db, now: Date) {
  const active = db
    .select({ userId: refreshTokens.userId, sessions: count().as('sessions') })
    .from(refreshTokens)
    .where(and(isNull(refreshTokens.revokedAt), gt(refreshTokens.expiresAt, now)))
    .groupBy(refreshTokens.userId)
    .as('active');
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      disabledAt: users.disabledAt,
      activeSessions: sql<number>`coalesce(${active.sessions}, 0)::int`,
    })
    .from(users)
    .leftJoin(active, eq(active.userId, users.id))
    .orderBy(users.createdAt);
}

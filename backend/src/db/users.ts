import { eq, sql } from 'drizzle-orm';
import type { Db } from './client.js';
import { users, type UserRow } from './schema.js';

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

export async function insertOwner(
  db: Db,
  input: { id: string; email: string; name: string; passwordHash: string },
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

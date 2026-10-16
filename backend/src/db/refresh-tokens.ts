import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from './client.js';
import { refreshTokens, type RefreshTokenRow } from './schema.js';

export async function insertRefreshToken(
  db: Db,
  input: { id: string; userId: string; familyId: string; tokenHash: string; expiresAt: Date },
): Promise<void> {
  await db.insert(refreshTokens).values(input);
}

export async function findRefreshTokenByHash(db: Db, tokenHash: string): Promise<RefreshTokenRow | undefined> {
  const [row] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash)).limit(1);
  return row;
}

// Revoga só se ainda estiver ativo. Retorna false se outra requisição já usou
// o token — é isso que impede duas rotações paralelas do mesmo token.
export async function revokeIfActive(db: Db, id: string, now: Date): Promise<boolean> {
  const rows = await db
    .update(refreshTokens)
    .set({ revokedAt: now })
    .where(and(eq(refreshTokens.id, id), isNull(refreshTokens.revokedAt)))
    .returning({ id: refreshTokens.id });
  return rows.length > 0;
}

export async function revokeFamily(db: Db, familyId: string, now: Date): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: now })
    .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
}

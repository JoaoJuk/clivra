import { and, count, desc, eq, gt, isNull, lt, ne, sql } from 'drizzle-orm';
import type { Db } from './client.js';
import { emailCodes, type EmailCodePurpose } from './schema.js';

// Grava o código só se respeitar o intervalo de reenvio e o teto diário.
// O advisory lock por e-mail/finalidade serializa pedidos paralelos: sem ele,
// N pedidos simultâneos passariam todos pelas checagens.
export async function insertEmailCodeIfAllowed(
  db: Db,
  input: { id: string; email: string; purpose: EmailCodePurpose; codeHash: string; expiresAt: Date },
  limits: { now: Date; resendAfter: Date; daySince: Date; maxPerDay: number },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`email-code:${input.purpose}:${input.email}`}))`);
    const scope = and(eq(emailCodes.email, input.email), eq(emailCodes.purpose, input.purpose));
    const [latest] = await tx
      .select({ createdAt: emailCodes.createdAt })
      .from(emailCodes)
      .where(scope)
      .orderBy(desc(emailCodes.createdAt))
      .limit(1);
    if (latest && latest.createdAt > limits.resendAfter) return false;
    const [day] = await tx
      .select({ total: count() })
      .from(emailCodes)
      .where(and(scope, gt(emailCodes.createdAt, limits.daySince)));
    if ((day?.total ?? 0) >= limits.maxPerDay) return false;
    await tx.insert(emailCodes).values({ ...input, createdAt: limits.now });
    return true;
  });
}

// Reserva uma tentativa em cada código ainda válido antes de comparar.
// Atômico: tentativas em paralelo não passam do limite. Devolve só os códigos
// em que a tentativa foi reservada.
export async function claimActiveEmailCodes(
  db: Db,
  email: string,
  purpose: EmailCodePurpose,
  now: Date,
  maxAttempts: number,
): Promise<{ id: string; codeHash: string }[]> {
  return db
    .update(emailCodes)
    .set({ attempts: sql`${emailCodes.attempts} + 1` })
    .where(
      and(
        eq(emailCodes.email, email),
        eq(emailCodes.purpose, purpose),
        isNull(emailCodes.consumedAt),
        gt(emailCodes.expiresAt, now),
        lt(emailCodes.attempts, maxAttempts),
      ),
    )
    .returning({ id: emailCodes.id, codeHash: emailCodes.codeHash });
}

// Consome o código acertado (só se ainda não foi) e encerra os outros do mesmo
// e-mail/finalidade. false = outra requisição usou antes.
export async function consumeEmailCode(
  db: Db,
  id: string,
  email: string,
  purpose: EmailCodePurpose,
  now: Date,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(emailCodes)
      .set({ consumedAt: now })
      .where(and(eq(emailCodes.id, id), isNull(emailCodes.consumedAt)))
      .returning({ id: emailCodes.id });
    if (rows.length === 0) return false;
    await tx
      .update(emailCodes)
      .set({ consumedAt: now })
      .where(
        and(
          eq(emailCodes.email, email),
          eq(emailCodes.purpose, purpose),
          isNull(emailCodes.consumedAt),
          ne(emailCodes.id, id),
        ),
      );
    return true;
  });
}

export async function deleteEmailCodesBefore(db: Db, before: Date): Promise<void> {
  await db.delete(emailCodes).where(lt(emailCodes.createdAt, before));
}


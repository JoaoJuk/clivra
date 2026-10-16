import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    // Família (D16): um admin (quem instalou) e membros convidados por ele.
    // O índice parcial abaixo garante um único admin no próprio banco, mesmo
    // com dois cadastros simultâneos.
    role: text('role', { enum: ['admin', 'member'] }).notNull().default('member'),
    // Bloqueado pelo admin: não entra, e as sessões abertas caem na hora.
    disabledAt: timestamptz('disabled_at'),
    lastLoginAt: timestamptz('last_login_at'),
    // Sessões (refresh e access token) anteriores a isto não valem mais
    // (troca de senha, bloqueio, "derrubar sessões").
    sessionsValidAfter: timestamptz('sessions_valid_after'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('users_email_key').on(table.email),
    uniqueIndex('users_single_admin_key').on(table.role).where(sql`${table.role} = 'admin'`),
  ],
);

// Convite do admin: só e-mail convidado consegue criar conta (depois do admin).
export const invites = pgTable(
  'invites',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull(),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamptz('expires_at').notNull(),
    acceptedAt: timestamptz('accepted_at'),
    revokedAt: timestamptz('revoked_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [index('invites_email_idx').on(table.email)],
);

// Refresh tokens são opacos: o banco guarda só o SHA-256, nunca o token.
// `familyId` liga as rotações de uma mesma sessão para detectar reuso.
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamptz('expires_at').notNull(),
    revokedAt: timestamptz('revoked_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('refresh_tokens_hash_key').on(table.tokenHash),
    index('refresh_tokens_family_idx').on(table.familyId),
  ],
);

// Códigos de 6 dígitos enviados por e-mail (cadastro e "esqueci a senha").
// O banco guarda só o HMAC do código — vazar a tabela não revela o código.
export const emailCodes = pgTable(
  'email_codes',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull(),
    purpose: text('purpose', { enum: ['register', 'password_reset'] }).notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamptz('expires_at').notNull(),
    consumedAt: timestamptz('consumed_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [index('email_codes_lookup_idx').on(table.email, table.purpose, table.createdAt)],
);

export type UserRow = typeof users.$inferSelect;
export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
export type InviteRow = typeof invites.$inferSelect;
export type UserRole = UserRow['role'];
export type EmailCodeRow = typeof emailCodes.$inferSelect;
export type EmailCodePurpose = EmailCodeRow['purpose'];

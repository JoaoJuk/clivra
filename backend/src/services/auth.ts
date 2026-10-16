import { createHash, timingSafeEqual } from 'node:crypto';
import type { Db } from '../db/client.js';
import {
  findRefreshTokenByHash,
  insertRefreshToken,
  revokeAllForUser,
  revokeFamily,
  revokeIfActive,
} from '../db/refresh-tokens.js';
import type { UserRow } from '../db/schema.js';
import { findUserByEmail, findUserById, hasAnyUser, insertOwner, updatePasswordAndCutSessions } from '../db/users.js';
import { errors } from '../lib/errors.js';
import { newId, toIso } from '../lib/ids.js';
import type { EmailCodeService } from './email-codes.js';
import { LoginThrottle } from './login-throttle.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from './passwords.js';
import { type AccessTokens, hashRefreshToken, newRefreshToken } from './tokens.js';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: PublicUser;
}

export function toPublicUser(user: UserRow): PublicUser {
  return { id: user.id, email: user.email, name: user.name, createdAt: toIso(user.createdAt) };
}

function isUniqueViolation(error: unknown): boolean {
  const cause = error instanceof Error && 'cause' in error ? error.cause : error;
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === '23505';
}

function sameSecret(given: string, expected: string): boolean {
  // Compara hashes de tamanho fixo em tempo constante (não vaza o código por timing).
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function createAuthService(deps: {
  db: Db;
  accessTokens: AccessTokens;
  refreshTtlDays: number;
  // undefined + produção = cadastro fechado; undefined fora de produção = sem código.
  ownerSetupCode: string | undefined;
  production: boolean;
  // undefined = sem SMTP configurado: cadastro sem código de e-mail e sem
  // "esqueci a senha".
  emailCodes: EmailCodeService | undefined;
}) {
  const { db, accessTokens } = deps;
  const refreshTtlMs = deps.refreshTtlDays * 24 * 60 * 60 * 1000;
  const fifteenMinutes = 15 * 60 * 1000;
  // Por conta+IP: trava quem está chutando, sem travar o dono em outro IP.
  const throttlePerClient = new LoginThrottle(10, fifteenMinutes);
  // Por conta, teto alto: freia ataque distribuído em muitos IPs.
  const throttlePerAccount = new LoginThrottle(100, fifteenMinutes);

  async function issueSession(user: UserRow, familyId: string = newId()): Promise<Session> {
    const refreshToken = newRefreshToken();
    await insertRefreshToken(db, {
      id: newId(),
      userId: user.id,
      familyId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + refreshTtlMs),
    });
    return {
      accessToken: await accessTokens.sign(user.id),
      refreshToken,
      expiresIn: accessTokens.ttlSeconds,
      user: toPublicUser(user),
    };
  }

  async function assertCanRegister(setupCode: string | undefined): Promise<void> {
    if (await hasAnyUser(db)) throw errors.registrationClosed();
    if (deps.ownerSetupCode) {
      if (!setupCode || !sameSecret(setupCode, deps.ownerSetupCode)) throw errors.invalidSetupCode();
    } else if (deps.production) {
      throw errors.registrationClosed();
    }
  }

  return {
    refreshTtlMs,
    emailCodesEnabled: deps.emailCodes !== undefined,

    async register(input: {
      email: string;
      password: string;
      name: string;
      setupCode?: string | undefined;
      emailCode?: string | undefined;
    }): Promise<Session> {
      await assertCanRegister(input.setupCode);
      if (deps.emailCodes) {
        if (!input.emailCode) throw errors.invalidEmailCode();
        await deps.emailCodes.consume(input.email, 'register', input.emailCode);
      }
      const passwordHash = await hashPassword(input.password);
      try {
        const user = await insertOwner(db, { id: newId(), email: input.email, name: input.name, passwordHash });
        return await issueSession(user);
      } catch (error) {
        // Dois cadastros ao mesmo tempo: o índice único de dono barra o segundo.
        if (isUniqueViolation(error)) throw errors.registrationClosed();
        throw error;
      }
    },

    async login(input: { email: string; password: string }, clientIp: string): Promise<Session> {
      const clientKey = `${input.email}|${clientIp}`;
      const blockedFor =
        throttlePerClient.blockedForSeconds(clientKey) ?? throttlePerAccount.blockedForSeconds(input.email);
      if (blockedFor !== null) throw errors.rateLimited(blockedFor);

      const user = await findUserByEmail(db, input.email);
      let ok = false;
      if (user) ok = await verifyPassword(user.passwordHash, input.password);
      else await burnPasswordCheck(input.password);
      if (!user || !ok) {
        throttlePerClient.recordFailure(clientKey);
        throttlePerAccount.recordFailure(input.email);
        throw errors.invalidCredentials();
      }
      throttlePerClient.reset(clientKey);
      return issueSession(user);
    },

    // Rotação: cada refresh token vale uma vez só. Se um token já usado aparecer
    // de novo, alguém copiou ele — a sessão inteira (família) é derrubada.
    async refresh(refreshToken: string): Promise<Session> {
      const now = new Date();
      const row = await findRefreshTokenByHash(db, hashRefreshToken(refreshToken));
      if (!row) throw errors.invalidRefreshToken();
      if (row.revokedAt || !(await revokeIfActive(db, row.id, now))) {
        await revokeFamily(db, row.familyId, now);
        throw errors.invalidRefreshToken();
      }
      if (row.expiresAt <= now) throw errors.invalidRefreshToken();
      const user = await findUserById(db, row.userId);
      if (!user) throw errors.invalidRefreshToken();
      const session = await issueSession(user, row.familyId);
      // Conferido DEPOIS de gravar o token novo (ver resetPassword): sessão
      // anterior a uma troca de senha cai, mesmo em corrida com a troca.
      const fresh = await findUserById(db, row.userId);
      if (!fresh || (fresh.sessionsValidAfter && row.createdAt < fresh.sessionsValidAfter)) {
        await revokeFamily(db, row.familyId, new Date());
        throw errors.invalidRefreshToken();
      }
      return session;
    },

    // Envia o código de 6 dígitos. Para "esqueci a senha" a resposta é a mesma
    // exista ou não a conta (não revela qual e-mail está cadastrado).
    async requestEmailCode(input: {
      email: string;
      purpose: 'register' | 'password_reset';
      setupCode?: string | undefined;
    }): Promise<void> {
      if (!deps.emailCodes) throw errors.emailDisabled();
      if (input.purpose === 'register') {
        await assertCanRegister(input.setupCode);
        await deps.emailCodes.issue(input.email, 'register');
        return;
      }
      deps.emailCodes.issueInBackground(input.email, 'password_reset', async () =>
        Boolean(await findUserByEmail(db, input.email)),
      );
    },

    // Troca a senha com o código do e-mail e derruba todas as sessões abertas.
    async resetPassword(input: { email: string; emailCode: string; newPassword: string }): Promise<void> {
      if (!deps.emailCodes) throw errors.emailDisabled();
      await deps.emailCodes.consume(input.email, 'password_reset', input.emailCode);
      const user = await findUserByEmail(db, input.email);
      if (!user) throw errors.invalidEmailCode();
      // Primeiro o corte (commit), depois a revogação: um refresh concorrente ou
      // vê o corte e é recusado, ou já gravou o token novo e a revogação o pega.
      await updatePasswordAndCutSessions(db, user.id, await hashPassword(input.newPassword));
      await revokeAllForUser(db, user.id, new Date());
      throttlePerAccount.reset(input.email);
    },

    async logout(refreshToken: string): Promise<void> {
      const row = await findRefreshTokenByHash(db, hashRefreshToken(refreshToken));
      if (row) await revokeFamily(db, row.familyId, new Date());
    },

    async me(userId: string): Promise<PublicUser> {
      const user = await findUserById(db, userId);
      if (!user) throw errors.unauthenticated();
      return toPublicUser(user);
    },

    async authenticate(accessToken: string): Promise<string> {
      const userId = await accessTokens.verify(accessToken);
      if (!userId) throw errors.unauthenticated();
      return userId;
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;

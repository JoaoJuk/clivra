import type { Db } from '../db/client.js';
import { findRefreshTokenByHash, insertRefreshToken, revokeFamily, revokeIfActive } from '../db/refresh-tokens.js';
import type { UserRow } from '../db/schema.js';
import { findUserByEmail, findUserById, hasAnyUser, insertOwner } from '../db/users.js';
import { errors } from '../lib/errors.js';
import { newId, toIso } from '../lib/ids.js';
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

export function createAuthService(deps: { db: Db; accessTokens: AccessTokens; refreshTtlDays: number }) {
  const { db, accessTokens } = deps;
  const refreshTtlMs = deps.refreshTtlDays * 24 * 60 * 60 * 1000;
  const throttle = new LoginThrottle(10, 15 * 60 * 1000);

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

  return {
    refreshTtlMs,

    async register(input: { email: string; password: string; name: string }): Promise<Session> {
      if (await hasAnyUser(db)) throw errors.registrationClosed();
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

    async login(input: { email: string; password: string }): Promise<Session> {
      if (throttle.isBlocked(input.email)) throw errors.rateLimited();
      const user = await findUserByEmail(db, input.email);
      if (!user) {
        await burnPasswordCheck(input.password);
        throttle.recordFailure(input.email);
        throw errors.invalidCredentials();
      }
      if (!(await verifyPassword(user.passwordHash, input.password))) {
        throttle.recordFailure(input.email);
        throw errors.invalidCredentials();
      }
      throttle.reset(input.email);
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
      return issueSession(user, row.familyId);
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

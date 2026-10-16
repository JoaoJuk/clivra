import { createHash, timingSafeEqual } from 'node:crypto';
import type { Db } from '../db/client.js';
import { acceptInvite, findActiveInvite } from '../db/invites.js';
import {
  findRefreshTokenByHash,
  insertRefreshToken,
  revokeAllForUser,
  revokeFamily,
  revokeIfActive,
} from '../db/refresh-tokens.js';
import type { UserRole, UserRow } from '../db/schema.js';
import {
  findUserByEmail,
  findUserById,
  hasAnyUser,
  insertUser,
  touchLastLogin,
  updatePasswordAndCutSessions,
} from '../db/users.js';
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
  role: UserRole;
  createdAt: string;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: PublicUser;
}

export interface AuthContext {
  userId: string;
  role: UserRole;
}

export function toPublicUser(user: UserRow): PublicUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role, createdAt: toIso(user.createdAt) };
}

function isUniqueViolation(error: unknown): boolean {
  const cause = error instanceof Error && 'cause' in error ? error.cause : error;
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === '23505';
}

function constraintOf(error: unknown): string | undefined {
  const cause = error instanceof Error && 'cause' in error ? error.cause : error;
  return typeof cause === 'object' && cause !== null && 'constraint' in cause && typeof cause.constraint === 'string'
    ? cause.constraint
    : undefined;
}

function sameSecret(given: string, expected: string): boolean {
  // Compara hashes de tamanho fixo em tempo constante (não vaza o código por timing).
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

// Sessão emitida antes do corte (troca de senha, bloqueio, "derrubar sessões").
function issuedBeforeCut(user: UserRow, issuedAtMs: number): boolean {
  return user.sessionsValidAfter !== null && issuedAtMs < user.sessionsValidAfter.getTime();
}

export function createAuthService(deps: {
  db: Db;
  accessTokens: AccessTokens;
  refreshTtlDays: number;
  // Exigido só no 1º cadastro (o admin). undefined + produção = cadastro do
  // admin fechado; undefined fora de produção = sem código.
  ownerSetupCode: string | undefined;
  production: boolean;
  // undefined = sem SMTP configurado: cadastro sem código de e-mail, sem
  // convites e sem "esqueci a senha".
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

  // "Último acesso" do painel: só depois que a sessão foi aceita (uma conta
  // bloqueada recusada no refresh não pode parecer ativa).
  async function accepted(session: Session): Promise<Session> {
    await touchLastLogin(db, session.user.id);
    return session;
  }

  // Cadastro do admin (primeira conta do app): exige o código de configuração.
  function assertOwnerSetup(setupCode: string | undefined): void {
    if (deps.ownerSetupCode) {
      if (!setupCode || !sameSecret(setupCode, deps.ownerSetupCode)) throw errors.invalidSetupCode();
    } else if (deps.production) {
      throw errors.registrationClosed();
    }
  }

  async function createUser(input: { email: string; password: string; name: string }, role: UserRole, inviteId?: string) {
    const passwordHash = await hashPassword(input.password);
    try {
      return await db.transaction(async (tx) => {
        if (inviteId && !(await acceptInvite(tx, inviteId, new Date()))) throw errors.invalidEmailCode();
        return insertUser(tx, { id: newId(), email: input.email, name: input.name, passwordHash, role });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        // Dois cadastros de admin ao mesmo tempo: o índice parcial barra o segundo.
        if (constraintOf(error) === 'users_single_admin_key') throw errors.registrationClosed();
        throw errors.emailTaken();
      }
      throw error;
    }
  }

  return {
    refreshTtlMs,
    emailCodesEnabled: deps.emailCodes !== undefined,

    // Diz ao front se a tela de cadastro é a do admin (com código de
    // configuração) ou a de convidado.
    async registrationMode(): Promise<'owner_setup' | 'invite_only'> {
      return (await hasAnyUser(db)) ? 'invite_only' : 'owner_setup';
    },

    async register(input: {
      email: string;
      password: string;
      name: string;
      setupCode?: string | undefined;
      emailCode?: string | undefined;
    }): Promise<Session> {
      if (!(await hasAnyUser(db))) {
        assertOwnerSetup(input.setupCode);
        if (deps.emailCodes) {
          if (!input.emailCode) throw errors.invalidEmailCode();
          await deps.emailCodes.consume(input.email, 'register', input.emailCode);
        }
        return accepted(await issueSession(await createUser(input, 'admin')));
      }

      // Depois do admin, só entra quem foi convidado — e sempre com código de e-mail.
      if (!deps.emailCodes) throw errors.registrationClosed();
      if (!input.emailCode) throw errors.invalidEmailCode();
      await deps.emailCodes.consume(input.email, 'register', input.emailCode);
      const invite = await findActiveInvite(db, input.email, new Date());
      if (!invite) throw errors.invalidEmailCode();
      return accepted(await issueSession(await createUser(input, 'member', invite.id)));
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
      // Só depois da senha certa: quem não sabe a senha não descobre o bloqueio.
      if (user.disabledAt) throw errors.accountDisabled();
      return accepted(await issueSession(user));
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
      // anterior a um corte cai, mesmo em corrida com o corte.
      const fresh = await findUserById(db, row.userId);
      if (!fresh || fresh.disabledAt || issuedBeforeCut(fresh, row.createdAt.getTime())) {
        await revokeFamily(db, row.familyId, new Date());
        throw errors.invalidRefreshToken();
      }
      return accepted(session);
    },

    // Envia o código de 6 dígitos. Fora o cadastro do admin, a resposta é a
    // mesma exista ou não a conta/o convite (não revela quem está cadastrado
    // ou convidado), e o trabalho roda depois de responder.
    async requestEmailCode(input: {
      email: string;
      purpose: 'register' | 'password_reset';
      setupCode?: string | undefined;
    }): Promise<void> {
      if (!deps.emailCodes) throw errors.emailDisabled();
      const emailCodes = deps.emailCodes;
      if (input.purpose === 'register') {
        if (!(await hasAnyUser(db))) {
          assertOwnerSetup(input.setupCode);
          await emailCodes.issue(input.email, 'register');
          return;
        }
        emailCodes.issueInBackground(input.email, 'register', async () =>
          Boolean(await findActiveInvite(db, input.email, new Date())) && !(await findUserByEmail(db, input.email)),
        );
        return;
      }
      emailCodes.issueInBackground(input.email, 'password_reset', async () => {
        const user = await findUserByEmail(db, input.email);
        return Boolean(user && !user.disabledAt);
      });
    },

    // Troca a senha com o código do e-mail e derruba todas as sessões abertas.
    async resetPassword(input: { email: string; emailCode: string; newPassword: string }): Promise<void> {
      if (!deps.emailCodes) throw errors.emailDisabled();
      await deps.emailCodes.consume(input.email, 'password_reset', input.emailCode);
      const user = await findUserByEmail(db, input.email);
      // Conta bloqueada não troca a senha nem com código pedido antes do bloqueio.
      if (!user || user.disabledAt) throw errors.invalidEmailCode();
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

    // Toda requisição autenticada confere o usuário no banco: bloqueio e
    // "derrubar sessões" valem na hora, sem esperar o access token vencer.
    async authenticate(accessToken: string): Promise<AuthContext> {
      const token = await accessTokens.verify(accessToken);
      if (!token) throw errors.unauthenticated();
      const user = await findUserById(db, token.userId);
      if (!user || user.disabledAt || issuedBeforeCut(user, token.issuedAtMs)) throw errors.unauthenticated();
      return { userId: user.id, role: user.role };
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;

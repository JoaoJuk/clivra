import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import type { MailMessage } from '../src/services/mailer.js';
import { createTestApp, owner } from './helpers.js';

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
let ctx: TestApp;
let sent: MailMessage[];

const SETUP_CODE = 'codigo-de-configuracao-123';
const member = { email: 'filha@familia.com', password: 'senha-da-filha', name: 'Ana' };

beforeEach(async () => {
  sent = [];
  ctx = await createTestApp(
    { OWNER_SETUP_CODE: SETUP_CODE, APP_URL: 'https://app.exemplo.com' },
    { mailer: { async send(message) { sent.push(message); } } },
  );
});
afterEach(async () => {
  await ctx.close();
});

let ipCounter = 0;
// IP novo por chamada: os testes não esbarram no rate limit por IP.
const nextIp = () => `10.50.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

function post(url: string, payload?: Record<string, unknown>, token?: string) {
  return ctx.app.inject({
    method: 'POST',
    url,
    remoteAddress: nextIp(),
    ...(payload ? { payload } : {}),
    ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
  });
}

function get(url: string, token?: string) {
  return ctx.app.inject({ method: 'GET', url, ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}) });
}

async function waitForMail(count: number): Promise<void> {
  const start = Date.now();
  while (sent.length < count && Date.now() - start < 2000) await new Promise((r) => setTimeout(r, 10));
  assert.equal(sent.length, count);
}

function codeFrom(message: MailMessage | undefined): string {
  const match = /\b(\d{6})\b/.exec(message?.text ?? '');
  assert.ok(match?.[1], 'código não encontrado no e-mail');
  return match[1];
}

async function registerAdmin(): Promise<string> {
  await post('/v1/auth/email-code', { email: owner.email, purpose: 'register', setupCode: SETUP_CODE });
  const res = await post('/v1/auth/register', { ...owner, setupCode: SETUP_CODE, emailCode: codeFrom(sent.at(-1)) });
  assert.equal(res.statusCode, 201, res.body);
  assert.equal(res.json().user.role, 'admin');
  sent = [];
  return res.json().accessToken;
}

async function inviteAndRegisterMember(adminToken: string) {
  const invite = await post('/v1/admin/invites', { email: member.email }, adminToken);
  assert.equal(invite.statusCode, 201, invite.body);
  await post('/v1/auth/email-code', { email: member.email, purpose: 'register' });
  await waitForMail(2); // convite + código
  const res = await post('/v1/auth/register', { ...member, emailCode: codeFrom(sent[1]) });
  assert.equal(res.statusCode, 201, res.body);
  sent = [];
  return res.json() as { accessToken: string; refreshToken: string; user: { id: string; role: string } };
}

describe('cadastro em família', () => {
  test('modo de cadastro: owner_setup antes do admin, invite_only depois', async () => {
    assert.deepEqual((await get('/v1/auth/registration')).json(), { mode: 'owner_setup' });
    await registerAdmin();
    assert.deepEqual((await get('/v1/auth/registration')).json(), { mode: 'invite_only' });
  });

  test('admin convida, familiar cria conta como member e o convite some da lista', async () => {
    const adminToken = await registerAdmin();
    const invite = await post('/v1/admin/invites', { email: 'Filha@Familia.com' }, adminToken);
    assert.equal(invite.statusCode, 201);
    assert.equal(invite.json().email, member.email, 'e-mail normalizado');
    await waitForMail(1);
    assert.equal(sent[0]?.to, member.email);
    assert.match(sent[0]?.subject ?? '', /João convidou você/);
    assert.match(sent[0]?.text ?? '', /https:\/\/app\.exemplo\.com/);

    const pending = await get('/v1/admin/invites', adminToken);
    assert.equal(pending.json().data.length, 1);

    await post('/v1/auth/email-code', { email: member.email, purpose: 'register' });
    await waitForMail(2);
    const reg = await post('/v1/auth/register', { ...member, emailCode: codeFrom(sent[1]) });
    assert.equal(reg.statusCode, 201, reg.body);
    assert.equal(reg.json().user.role, 'member');

    assert.equal((await get('/v1/admin/invites', adminToken)).json().data.length, 0);
    const me = await get('/v1/auth/me', reg.json().accessToken);
    assert.equal(me.json().role, 'member');
  });

  test('e-mail não convidado: 202 sem e-mail e cadastro recusado', async () => {
    await registerAdmin();
    const code = await post('/v1/auth/email-code', { email: 'estranho@x.com', purpose: 'register' });
    assert.equal(code.statusCode, 202);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(sent.length, 0);
    const reg = await post('/v1/auth/register', { email: 'estranho@x.com', password: 'qualquer-123', name: 'X', emailCode: '123456' });
    assert.equal(reg.statusCode, 400);
    assert.equal(reg.json().error.code, 'INVALID_EMAIL_CODE');
  });

  test('convite revogado não deixa cadastrar', async () => {
    const adminToken = await registerAdmin();
    const invite = await post('/v1/admin/invites', { email: member.email }, adminToken);
    await waitForMail(1);
    const del = await ctx.app.inject({
      method: 'DELETE',
      url: `/v1/admin/invites/${invite.json().id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(del.statusCode, 204);
    await post('/v1/auth/email-code', { email: member.email, purpose: 'register' });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(sent.length, 1, 'só o e-mail do convite; nenhum código');
  });

  test('convidar e-mail que já tem conta: 409 CONFLICT', async () => {
    const adminToken = await registerAdmin();
    const res = await post('/v1/admin/invites', { email: owner.email }, adminToken);
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().error.code, 'CONFLICT');
  });
});

describe('nome no cadastro', () => {
  test('nome com quebra de linha é recusado', async () => {
    const res = await post('/v1/auth/register', { ...owner, name: 'Ana\n\n(texto enganoso)', setupCode: SETUP_CODE, emailCode: '123456' });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.code, 'VALIDATION_ERROR');
  });
});

describe('painel do admin', () => {
  test('sem token 401; member 403; admin vê só dados de conta', async () => {
    const adminToken = await registerAdmin();
    const { accessToken: memberToken } = await inviteAndRegisterMember(adminToken);

    assert.equal((await get('/v1/admin/users')).statusCode, 401);
    const forbidden = await get('/v1/admin/users', memberToken);
    assert.equal(forbidden.statusCode, 403);
    assert.equal(forbidden.json().error.code, 'FORBIDDEN');
    assert.equal((await post('/v1/admin/invites', { email: 'x@x.com' }, memberToken)).statusCode, 403);

    const list = await get('/v1/admin/users', adminToken);
    assert.equal(list.statusCode, 200);
    const users = list.json().data;
    assert.equal(users.length, 2);
    assert.deepEqual(Object.keys(users[1]).sort(), [
      'activeSessions', 'createdAt', 'disabledAt', 'email', 'id', 'lastLoginAt', 'name', 'role',
    ]);
    assert.equal(users[1].role, 'member');
    assert.equal(users[1].activeSessions, 1);
    assert.ok(users[1].lastLoginAt);
    assert.ok(!list.body.includes('argon2'), 'hash da senha nunca sai');
  });

  test('bloquear derruba na hora: access token, refresh e login', async () => {
    const adminToken = await registerAdmin();
    const m = await inviteAndRegisterMember(adminToken);
    assert.equal((await get('/v1/auth/me', m.accessToken)).statusCode, 200);

    assert.equal((await post(`/v1/admin/users/${m.user.id}/disable`, undefined, adminToken)).statusCode, 204);

    assert.equal((await get('/v1/auth/me', m.accessToken)).statusCode, 401, 'access token cai na hora');
    assert.equal((await post('/v1/auth/refresh', { refreshToken: m.refreshToken })).statusCode, 401);
    const login = await post('/v1/auth/login', { email: member.email, password: member.password });
    assert.equal(login.statusCode, 403);
    assert.equal(login.json().error.code, 'FORBIDDEN');
    const wrong = await post('/v1/auth/login', { email: member.email, password: 'senha-errada' });
    assert.equal(wrong.statusCode, 401, 'sem a senha não se descobre o bloqueio');

    assert.equal((await post(`/v1/admin/users/${m.user.id}/enable`, undefined, adminToken)).statusCode, 204);
    const back = await post('/v1/auth/login', { email: member.email, password: member.password });
    assert.equal(back.statusCode, 200);
  });

  test('bloqueado não recebe código de "esqueci a senha"', async () => {
    const adminToken = await registerAdmin();
    const m = await inviteAndRegisterMember(adminToken);
    await post(`/v1/admin/users/${m.user.id}/disable`, undefined, adminToken);
    await post('/v1/auth/email-code', { email: member.email, purpose: 'password_reset' });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(sent.length, 0);
  });

  test('refresh recusado de conta bloqueada não mexe no "último acesso"', async () => {
    const adminToken = await registerAdmin();
    const m = await inviteAndRegisterMember(adminToken);
    const before = (await get('/v1/admin/users', adminToken)).json().data[1].lastLoginAt;
    await post(`/v1/admin/users/${m.user.id}/disable`, undefined, adminToken);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal((await post('/v1/auth/refresh', { refreshToken: m.refreshToken })).statusCode, 401);
    const after = (await get('/v1/admin/users', adminToken)).json().data[1].lastLoginAt;
    assert.equal(after, before);
  });

  test('derrubar sessões desconecta todos os aparelhos da pessoa', async () => {
    const adminToken = await registerAdmin();
    const m = await inviteAndRegisterMember(adminToken);
    const res = await post(`/v1/admin/users/${m.user.id}/revoke-sessions`, undefined, adminToken);
    assert.equal(res.statusCode, 204);
    assert.equal((await get('/v1/auth/me', m.accessToken)).statusCode, 401);
    assert.equal((await post('/v1/auth/refresh', { refreshToken: m.refreshToken })).statusCode, 401);
    // A pessoa continua podendo entrar de novo com a senha.
    assert.equal((await post('/v1/auth/login', { email: member.email, password: member.password })).statusCode, 200);
  });

  test('saúde do sistema: só admin, sem dado de usuário', async () => {
    const adminToken = await registerAdmin();
    const { accessToken: memberToken } = await inviteAndRegisterMember(adminToken);
    assert.equal((await get('/v1/admin/system', memberToken)).statusCode, 403);
    const res = await get('/v1/admin/system', adminToken);
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.deepEqual(Object.keys(body).sort(), ['database', 'environment', 'lastBackupAt', 'release', 'startedAt']);
    assert.equal(body.environment, 'development');
    assert.equal(body.release, 'dev');
    assert.equal(body.database, 'ok');
    assert.equal(body.lastBackupAt, null);
  });

  test('admin não bloqueia a si mesmo; id inexistente 404; id inválido 400', async () => {
    const adminToken = await registerAdmin();
    const adminId = (await get('/v1/auth/me', adminToken)).json().id;
    const self = await post(`/v1/admin/users/${adminId}/disable`, undefined, adminToken);
    assert.equal(self.statusCode, 422);
    assert.equal(self.json().error.code, 'UNPROCESSABLE');
    const missing = await post('/v1/admin/users/018f0000-0000-7000-8000-000000000000/disable', undefined, adminToken);
    assert.equal(missing.statusCode, 404);
    const invalid = await post('/v1/admin/users/nao-e-uuid/disable', undefined, adminToken);
    assert.equal(invalid.statusCode, 400);
  });
});

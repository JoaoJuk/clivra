import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { createTestApp, owner } from './helpers.js';

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});
afterEach(async () => {
  await ctx.close();
});

async function register() {
  const res = await ctx.app.inject({ method: 'POST', url: '/v1/auth/register', payload: owner });
  assert.equal(res.statusCode, 201, res.body);
  return res.json();
}

describe('GET /v1/health', () => {
  test('responde ok sem autenticação', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/health' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { status: 'ok', version: '1.0.0' });
  });
});

describe('POST /v1/auth/register', () => {
  test('cria o dono e devolve a sessão no formato do contrato', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/v1/auth/register', payload: owner });
    assert.equal(res.statusCode, 201);
    const body = res.json();
    assert.deepEqual(Object.keys(body).sort(), ['accessToken', 'expiresIn', 'refreshToken', 'user']);
    assert.equal(body.expiresIn, 900);
    assert.equal(body.user.email, 'voce@exemplo.com', 'e-mail normalizado em minúsculas');
    assert.equal(body.user.name, 'João');
    assert.match(body.user.id, /^[0-9a-f]{8}-[0-9a-f]{4}-7/, 'UUID v7');
    assert.ok(!res.body.includes('argon2'), 'hash da senha nunca sai na resposta');
  });

  test('grava o refresh token em cookie HttpOnly, SameSite=Strict, restrito a /v1/auth', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/v1/auth/register', payload: owner });
    const cookie = res.cookies.find((c) => c.name === 'clivra_rt');
    assert.ok(cookie);
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, 'Strict');
    assert.equal(cookie.path, '/v1/auth');
    assert.equal(cookie.value, res.json().refreshToken);
  });

  test('segundo cadastro é recusado com REGISTRATION_CLOSED', async () => {
    await register();
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { ...owner, email: 'outra@pessoa.com' },
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error.code, 'REGISTRATION_CLOSED');
  });

  test('cadastros simultâneos: só um vence', async () => {
    const attempts = await Promise.all(
      ['a@x.com', 'b@x.com', 'c@x.com'].map((email) =>
        ctx.app.inject({ method: 'POST', url: '/v1/auth/register', payload: { ...owner, email } }),
      ),
    );
    const codes = attempts.map((res) => res.statusCode).sort();
    assert.deepEqual(codes, [201, 403, 403]);
  });

  test('senha curta e e-mail inválido viram VALIDATION_ERROR com details em português', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'nao-e-email', password: '123', name: 'João' },
    });
    assert.equal(res.statusCode, 400);
    const { error } = res.json();
    assert.equal(error.code, 'VALIDATION_ERROR');
    const fields = error.details.map((d: { field: string }) => d.field).sort();
    assert.deepEqual(fields, ['email', 'password']);
    assert.ok(error.requestId);
  });
});

describe('POST /v1/auth/login', () => {
  test('entra com e-mail em qualquer caixa', async () => {
    await register();
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'VOCE@exemplo.com', password: owner.password },
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.json().accessToken);
  });

  test('senha errada e e-mail inexistente dão a MESMA resposta (não revela quem tem conta)', async () => {
    await register();
    const wrongPassword = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: owner.email, password: 'errada123' },
    });
    const unknownEmail = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'ninguem@exemplo.com', password: 'errada123' },
    });
    assert.equal(wrongPassword.statusCode, 401);
    assert.equal(unknownEmail.statusCode, 401);
    assert.equal(wrongPassword.json().error.code, 'INVALID_CREDENTIALS');
    assert.equal(wrongPassword.json().error.message, unknownEmail.json().error.message);
  });
});

describe('GET /v1/auth/me', () => {
  test('exige token', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/auth/me' });
    assert.equal(res.statusCode, 401);
    assert.equal(res.json().error.code, 'UNAUTHENTICATED');
  });

  test('devolve o usuário com o token válido', async () => {
    const session = await register();
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.email, 'voce@exemplo.com');
    assert.match(body.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  test('recusa token adulterado', async () => {
    const session = await register();
    const [header, payload, signature] = session.accessToken.split('.');
    const tampered = `${header}.${payload}.${signature.slice(0, -4)}AAAA`;
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { authorization: `Bearer ${tampered}` },
    });
    assert.equal(res.statusCode, 401);
  });

  test('recusa token com alg "none" (ataque clássico de JWT)', async () => {
    const session = await register();
    const payload = session.accessToken.split('.')[1];
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { authorization: `Bearer ${header}.${payload}.` },
    });
    assert.equal(res.statusCode, 401);
  });

  test('recusa token assinado com outro segredo', async () => {
    const other = await createTestApp({ JWT_SECRET: 'another-secret-that-is-also-long-enough-123' });
    try {
      const forged = await other.app.inject({ method: 'POST', url: '/v1/auth/register', payload: owner });
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/v1/auth/me',
        headers: { authorization: `Bearer ${forged.json().accessToken}` },
      });
      assert.equal(res.statusCode, 401);
    } finally {
      await other.close();
    }
  });
});

describe('POST /v1/auth/refresh', () => {
  test('rotaciona: devolve um refresh novo e o antigo deixa de valer', async () => {
    const session = await register();
    const first = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: session.refreshToken },
    });
    assert.equal(first.statusCode, 200);
    assert.notEqual(first.json().refreshToken, session.refreshToken);
  });

  test('reuso de token já usado derruba a sessão inteira (detecção de roubo)', async () => {
    const session = await register();
    const rotated = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: session.refreshToken },
    });
    const stolenReplay = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: session.refreshToken },
    });
    assert.equal(stolenReplay.statusCode, 401);
    assert.equal(stolenReplay.json().error.code, 'INVALID_REFRESH_TOKEN');

    const legitAfterTheft = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: rotated.json().refreshToken },
    });
    assert.equal(legitAfterTheft.statusCode, 401, 'token novo da mesma sessão também foi revogado');
  });

  test('funciona só com o cookie, sem corpo (modo P-13)', async () => {
    const session = await register();
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      cookies: { clivra_rt: session.refreshToken },
    });
    assert.equal(res.statusCode, 200, res.body);
  });

  test('cookie + Content-Type JSON com corpo vazio também funciona', async () => {
    const session = await register();
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      headers: { 'content-type': 'application/json' },
      cookies: { clivra_rt: session.refreshToken },
    });
    assert.equal(res.statusCode, 200, res.body);
  });

  test('sem token nenhum → INVALID_REFRESH_TOKEN', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/v1/auth/refresh' });
    assert.equal(res.statusCode, 401);
    assert.equal(res.json().error.code, 'INVALID_REFRESH_TOKEN');
  });

  test('token inventado → INVALID_REFRESH_TOKEN', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: 'inventado' },
    });
    assert.equal(res.statusCode, 401);
  });
});

describe('POST /v1/auth/logout', () => {
  test('invalida o refresh e limpa o cookie', async () => {
    const session = await register();
    const out = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      payload: { refreshToken: session.refreshToken },
    });
    assert.equal(out.statusCode, 204);
    const cleared = out.cookies.find((c) => c.name === 'clivra_rt');
    assert.equal(cleared?.value, '');

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: session.refreshToken },
    });
    assert.equal(res.statusCode, 401);
  });
});

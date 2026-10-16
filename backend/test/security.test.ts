import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { TEST_ORIGIN, createTestApp, owner } from './helpers.js';

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});
afterEach(async () => {
  await ctx.close();
});

function login(email: string, remoteAddress: string) {
  return ctx.app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    remoteAddress,
    payload: { email, password: 'chute-errado' },
  });
}

describe('envelope de erro', () => {
  test('rota inexistente → 404 NOT_FOUND no envelope', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/nao-existe' });
    assert.equal(res.statusCode, 404);
    assert.equal(res.json().error.code, 'NOT_FOUND');
  });

  test('JSON malformado → 400 sem stack trace', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{"email": ',
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.code, 'VALIDATION_ERROR');
    assert.ok(!/at .+\.(ts|js):\d+/.test(res.body), 'sem stack trace');
  });

  test('requestId do erro é o mesmo do cabeçalho x-request-id', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/auth/me' });
    assert.equal(res.json().error.requestId, res.headers['x-request-id']);
  });

  test('x-request-id enviado pelo cliente é ignorado (não dá pra forjar no log)', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/health', headers: { 'x-request-id': 'forjado' } });
    assert.notEqual(res.headers['x-request-id'], 'forjado');
  });

  test('prototype poisoning (__proto__) no JSON é recusado', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{"email":"a@b.com","password":"x","__proto__":{"isAdmin":true}}',
    });
    assert.equal(res.statusCode, 400);
  });

  test('formulário (CSRF clássico) não é aceito nas rotas de auth', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'refreshToken=x',
    });
    assert.equal(res.statusCode, 415);
  });

  test('corpo acima de 64 KB é recusado', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'a@b.com', password: 'x'.repeat(70 * 1024) },
    });
    assert.equal(res.statusCode, 413);
    assert.equal(res.json().error.code, 'VALIDATION_ERROR');
  });

  test('campo extra (ex.: isOwner) é ignorado, não vira privilégio', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { ...owner, isOwner: false, id: '00000000-0000-7000-8000-000000000000' },
    });
    assert.equal(res.statusCode, 201);
    assert.notEqual(res.json().user.id, '00000000-0000-7000-8000-000000000000');
  });
});

describe('cabeçalhos de segurança', () => {
  test('helmet aplicado', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/health' });
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.match(String(res.headers['content-security-policy']), /default-src 'none'/);
    assert.ok(res.headers['strict-transport-security']);
    assert.equal(res.headers['x-powered-by'], undefined);
  });

  test('CORS libera a origem do front', async () => {
    const res = await ctx.app.inject({
      method: 'OPTIONS',
      url: '/v1/auth/login',
      headers: { origin: TEST_ORIGIN, 'access-control-request-method': 'POST' },
    });
    assert.equal(res.headers['access-control-allow-origin'], TEST_ORIGIN);
    assert.equal(res.headers['access-control-allow-credentials'], 'true');
  });

  test('CORS NÃO libera origem desconhecida', async () => {
    const res = await ctx.app.inject({
      method: 'OPTIONS',
      url: '/v1/auth/login',
      headers: { origin: 'https://site-malicioso.com', 'access-control-request-method': 'POST' },
    });
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });
});

describe('força bruta no login', () => {
  test('por IP: a 11ª tentativa em 15 min leva 429 com Retry-After', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await login(`pessoa${i}@exemplo.com`, '10.0.0.1');
      assert.equal(res.statusCode, 401);
    }
    const blocked = await login('pessoa99@exemplo.com', '10.0.0.1');
    assert.equal(blocked.statusCode, 429);
    assert.equal(blocked.json().error.code, 'RATE_LIMITED');
    assert.ok(Number(blocked.headers['retry-after']) > 0);
  });

  test('por conta: 10 erros na mesma conta bloqueiam mesmo trocando de IP', async () => {
    await ctx.app.inject({ method: 'POST', url: '/v1/auth/register', payload: owner });
    for (let i = 0; i < 10; i++) {
      const res = await login(owner.email, `10.0.1.${i}`);
      assert.equal(res.statusCode, 401);
    }
    const blocked = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      remoteAddress: '10.0.2.1',
      payload: { email: owner.email, password: owner.password },
    });
    assert.equal(blocked.statusCode, 429, 'até a senha certa espera o bloqueio passar');
  });
});

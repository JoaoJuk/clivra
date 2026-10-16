import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { loadConfig } from '../src/config.js';
import { serializeErrorSafely } from '../src/lib/log.js';
import { createTestApp, owner } from './helpers.js';

const SETUP_CODE = 'codigo-secreto-de-setup-123';

const prodEnv = {
  NODE_ENV: 'production',
  JWT_SECRET: 'test-secret-that-is-long-enough-for-hs256-signing',
  DATABASE_URL: 'postgres://nao-usado-no-teste',
  COOKIE_SECURE: 'true',
  HOST: '127.0.0.1',
};

describe('primeiro cadastro (ninguém da internet vira dono)', () => {
  test('com OWNER_SETUP_CODE: sem código ou com código errado → 403; certo → 201', async () => {
    const ctx = await createTestApp({ OWNER_SETUP_CODE: SETUP_CODE });
    try {
      const semCodigo = await ctx.app.inject({ method: 'POST', url: '/v1/auth/register', payload: owner });
      assert.equal(semCodigo.statusCode, 403);
      assert.equal(semCodigo.json().error.code, 'FORBIDDEN');

      const errado = await ctx.app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: { ...owner, setupCode: 'chute' },
      });
      assert.equal(errado.statusCode, 403);

      const certo = await ctx.app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: { ...owner, setupCode: SETUP_CODE },
      });
      assert.equal(certo.statusCode, 201);
    } finally {
      await ctx.close();
    }
  });

  test('em produção SEM código configurado, o cadastro fica fechado', async () => {
    const ctx = await createTestApp(prodEnv);
    try {
      const res = await ctx.app.inject({ method: 'POST', url: '/v1/auth/register', payload: owner });
      assert.equal(res.statusCode, 403);
      assert.equal(res.json().error.code, 'REGISTRATION_CLOSED');
    } finally {
      await ctx.close();
    }
  });
});

describe('configuração de produção', () => {
  test('TRUST_PROXY=true é recusado (IP ficaria forjável)', () => {
    assert.throws(() => loadConfig({ ...prodEnv, TRUST_PROXY: 'true' }), /TRUST_PROXY/);
  });

  test('TRUST_PROXY aceita número de saltos', () => {
    assert.equal(loadConfig({ ...prodEnv, TRUST_PROXY: '2' }).TRUST_PROXY, 2);
  });

  test('HOST exposto (0.0.0.0) é recusado em produção', () => {
    assert.throws(() => loadConfig({ ...prodEnv, HOST: '0.0.0.0' }), /HOST/);
  });

  test('cookie sem Secure é recusado em produção', () => {
    assert.throws(() => loadConfig({ ...prodEnv, COOKIE_SECURE: 'false' }), /COOKIE_SECURE/);
  });
});

describe('atrás de proxy (TRUST_PROXY=1)', () => {
  test('forjar o começo do X-Forwarded-For não escapa do rate limit por IP', async () => {
    const ctx = await createTestApp({ TRUST_PROXY: '1' });
    try {
      const attempt = (fakeIp: string) =>
        ctx.app.inject({
          method: 'POST',
          url: '/v1/auth/login',
          remoteAddress: '127.0.0.1', // o proxy (Caddy)
          // O atacante inventa o primeiro IP; o proxy acrescenta o IP real no fim.
          headers: { 'x-forwarded-for': `${fakeIp}, 203.0.113.7` },
          payload: { email: `x${fakeIp}@exemplo.com`, password: 'chute-errado' },
        });
      for (let i = 0; i < 10; i++) assert.equal((await attempt(`1.1.1.${i}`)).statusCode, 401);
      assert.equal((await attempt('1.1.1.200')).statusCode, 429);
    } finally {
      await ctx.close();
    }
  });
});

describe('log de erro sem dado sensível (P4)', () => {
  test('erro de query não leva mensagem, params nem detail para o log', () => {
    // Mesmo formato do DrizzleQueryError + erro do Postgres.
    const pgError = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
      detail: 'Key (email)=(voce@exemplo.com) already exists.',
    });
    const queryError = Object.assign(
      new Error('Failed query: insert into "users" ...\nparams: voce@exemplo.com,João,$argon2id$...'),
      { name: 'DrizzleQueryError', params: ['voce@exemplo.com', 'João'], cause: pgError },
    );

    const logged = JSON.stringify(serializeErrorSafely(queryError));
    assert.ok(!logged.includes('voce@exemplo.com'), logged);
    assert.ok(!logged.includes('João'));
    assert.ok(!logged.includes('argon2'));
    assert.match(logged, /DrizzleQueryError/);
    assert.match(logged, /23505/, 'mantém o código do Postgres para diagnóstico');
  });
});

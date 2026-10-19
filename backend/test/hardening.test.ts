import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { rateLimitKey } from '../src/app.js';
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
  SMTP_USER: 'app@exemplo.com',
  SMTP_PASS: 'senha-de-app-falsa',
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
    // Sem SMTP o cadastro dispensaria o código de e-mail.
    assert.throws(() => loadConfig({ ...prodEnv, SMTP_USER: '', SMTP_PASS: '' }), /SMTP/);
    assert.throws(() => loadConfig({ ...prodEnv, SMTP_PASS: '' }), /SMTP/);
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

describe('P-15: só o proxy da Vercel fala com a API (PROXY_SECRET)', () => {
  const PROXY_SECRET = 'segredo-do-proxy-da-vercel-com-32-chars';
  const viaProxy = (ip: string) => ({ 'x-clivra-proxy-secret': PROXY_SECRET, 'x-clivra-client-ip': ip });

  test('sem o cabeçalho ou com segredo errado → 403; health continua aberto', async () => {
    const ctx = await createTestApp({ PROXY_SECRET });
    try {
      const direto = await ctx.app.inject({ method: 'GET', url: '/v1/auth/registration' });
      assert.equal(direto.statusCode, 403);
      assert.equal(direto.json().error.code, 'FORBIDDEN');

      const errado = await ctx.app.inject({
        method: 'GET',
        url: '/v1/auth/registration',
        headers: { 'x-clivra-proxy-secret': 'chute' },
      });
      assert.equal(errado.statusCode, 403);

      const certo = await ctx.app.inject({ method: 'GET', url: '/v1/auth/registration', headers: viaProxy('198.51.100.1') });
      assert.equal(certo.statusCode, 200);

      assert.equal((await ctx.app.inject({ method: 'GET', url: '/v1/health' })).statusCode, 200);
    } finally {
      await ctx.close();
    }
  });

  test('rate limit usa o IP do cliente informado pelo proxy, não o da Vercel', async () => {
    const ctx = await createTestApp({ PROXY_SECRET });
    try {
      const attempt = (ip: string) =>
        ctx.app.inject({
          method: 'POST',
          url: '/v1/auth/login',
          headers: viaProxy(ip),
          payload: { email: 'ninguem@exemplo.com', password: 'chute-errado' },
        });
      for (let i = 0; i < 10; i++) assert.equal((await attempt('198.51.100.1')).statusCode, 401);
      assert.equal((await attempt('198.51.100.1')).statusCode, 429);
      // Outra pessoa da família, atrás do mesmo proxy, não é barrada.
      assert.equal((await attempt('198.51.100.2')).statusCode, 401);
    } finally {
      await ctx.close();
    }
  });

  test('IPv6 do mesmo /64 conta como um cliente só', async () => {
    const ctx = await createTestApp({ PROXY_SECRET });
    try {
      const attempt = (ip: string) =>
        ctx.app.inject({
          method: 'POST',
          url: '/v1/auth/login',
          headers: viaProxy(ip),
          payload: { email: 'ninguem@exemplo.com', password: 'chute-errado' },
        });
      for (let i = 1; i <= 10; i++) assert.equal((await attempt(`2001:db8::${i.toString(16)}`)).statusCode, 401);
      assert.equal((await attempt('2001:db8:0:0:ffff::1')).statusCode, 429);
      assert.equal((await attempt('2001:db8:0:1::1')).statusCode, 401, 'outro /64 é outro cliente');
    } finally {
      await ctx.close();
    }
  });

  test('rateLimitKey normaliza IPv6 e IPv4 mapeado', () => {
    assert.equal(rateLimitKey('2001:DB8:0000:0001:aaaa::1'), '2001:db8:0:1::/64');
    assert.equal(rateLimitKey('::1'), '0:0:0:0::/64');
    assert.equal(rateLimitKey('::ffff:203.0.113.7'), '203.0.113.7');
    assert.equal(rateLimitKey('203.0.113.7'), '203.0.113.7');
  });

  test('PROXY_SECRET curto é recusado', () => {
    assert.throws(() => loadConfig({ ...prodEnv, PROXY_SECRET: 'curto' }), /PROXY_SECRET/);
  });
});

describe('refresh/logout com cookie recusam pedido de outro site (CSRF)', () => {
  test('Sec-Fetch-Site cross-site/same-site → 403 e a sessão continua válida', async () => {
    const ctx = await createTestApp();
    try {
      const reg = await ctx.app.inject({ method: 'POST', url: '/v1/auth/register', payload: owner });
      const refreshToken: string = reg.json().refreshToken;

      for (const site of ['cross-site', 'same-site']) {
        for (const url of ['/v1/auth/refresh', '/v1/auth/logout']) {
          const res = await ctx.app.inject({
            method: 'POST',
            url,
            headers: { 'sec-fetch-site': site },
            cookies: { clivra_rt: refreshToken },
          });
          assert.equal(res.statusCode, 403, `${url} ${site}`);
          assert.ok(!res.cookies.some((c) => c.name === 'clivra_rt'), 'não apaga o cookie');
        }
      }

      const mesmoSite = await ctx.app.inject({
        method: 'POST',
        url: '/v1/auth/refresh',
        headers: { 'sec-fetch-site': 'same-origin' },
        cookies: { clivra_rt: refreshToken },
      });
      assert.equal(mesmoSite.statusCode, 200, mesmoSite.body);
    } finally {
      await ctx.close();
    }
  });
});

describe('limpeza periódica', () => {
  test('apaga refresh tokens vencidos e convites velhos não aceitos', async () => {
    const { createMaintenance } = await import('../src/services/maintenance.js');
    const { refreshTokens } = await import('../src/db/schema.js');
    const ctx = await createTestApp();
    try {
      await ctx.app.inject({ method: 'POST', url: '/v1/auth/register', payload: owner });
      const db = ctx.database.db;
      assert.equal((await db.select().from(refreshTokens)).length, 1);

      await createMaintenance({ db }).run();
      assert.equal((await db.select().from(refreshTokens)).length, 1, 'token válido fica');

      await createMaintenance({ db }).run(new Date(Date.now() + 40 * 24 * 60 * 60 * 1000));
      assert.equal((await db.select().from(refreshTokens)).length, 0, 'token vencido sai');
    } finally {
      await ctx.close();
    }
  });
});

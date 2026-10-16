import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { sql } from 'drizzle-orm';
import type { MailMessage } from '../src/services/mailer.js';
import { createTestApp, owner } from './helpers.js';

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
let ctx: TestApp;
let sent: MailMessage[];

const SETUP_CODE = 'codigo-de-configuracao-123';
const ownerEmail = owner.email.toLowerCase();

beforeEach(async () => {
  sent = [];
  ctx = await createTestApp(
    { OWNER_SETUP_CODE: SETUP_CODE },
    {
      mailer: {
        async send(message) {
          sent.push(message);
        },
      },
    },
  );
});
afterEach(async () => {
  await ctx.close();
});

// O "esqueci a senha" roda depois de responder: espera o e-mail chegar.
async function waitForMail(count: number, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (sent.length < count && Date.now() - start < timeoutMs) await new Promise((r) => setTimeout(r, 10));
  assert.equal(sent.length, count);
}

// Simula a passagem do intervalo de reenvio sem esperar 60 s.
async function ageCodes(): Promise<void> {
  await ctx.database.db.execute(sql`update email_codes set created_at = created_at - interval '2 minutes'`);
}

function lastCode(): string {
  const message = sent.at(-1);
  assert.ok(message, 'nenhum e-mail enviado');
  const match = /\b(\d{6})\b/.exec(message.text);
  assert.ok(match?.[1]);
  return match[1];
}

function requestCode(payload: Record<string, unknown>, ip = '10.0.0.1') {
  return ctx.app.inject({ method: 'POST', url: '/v1/auth/email-code', payload, remoteAddress: ip });
}

function register(payload: Record<string, unknown>, ip = '10.0.0.1') {
  return ctx.app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { ...owner, setupCode: SETUP_CODE, ...payload },
    remoteAddress: ip,
  });
}

async function registerOwner() {
  const res = await requestCode({ email: owner.email, purpose: 'register', setupCode: SETUP_CODE });
  assert.equal(res.statusCode, 202, res.body);
  const reg = await register({ emailCode: lastCode() });
  assert.equal(reg.statusCode, 201, reg.body);
  sent = [];
}

function reset(payload: Record<string, unknown>) {
  return ctx.app.inject({ method: 'POST', url: '/v1/auth/password-reset', payload });
}

describe('POST /v1/auth/email-code (cadastro)', () => {
  test('envia um código de 6 dígitos só com o código, sem dado sensível', async () => {
    const res = await requestCode({ email: owner.email, purpose: 'register', setupCode: SETUP_CODE });
    assert.equal(res.statusCode, 202);
    assert.deepEqual(res.json(), { expiresIn: 600, resendIn: 60 });
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.to, ownerEmail, 'e-mail normalizado');
    assert.match(lastCode(), /^\d{6}$/);
  });

  test('sem setupCode correto não envia nada', async () => {
    const res = await requestCode({ email: owner.email, purpose: 'register', setupCode: 'errado-errado-errado' });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error.code, 'FORBIDDEN');
    assert.equal(sent.length, 0);
  });

  test('com dono já cadastrado responde REGISTRATION_CLOSED', async () => {
    await registerOwner();
    const res = await requestCode({ email: 'outra@pessoa.com', purpose: 'register', setupCode: SETUP_CODE });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error.code, 'REGISTRATION_CLOSED');
    assert.equal(sent.length, 0);
  });

  test('reenvio antes de 60 s é ignorado (mesma resposta, nenhum e-mail novo)', async () => {
    await requestCode({ email: owner.email, purpose: 'register', setupCode: SETUP_CODE });
    const res = await requestCode({ email: owner.email, purpose: 'register', setupCode: SETUP_CODE });
    assert.equal(res.statusCode, 202);
    assert.equal(sent.length, 1);
  });

  test('pedidos simultâneos: um código só (lock por e-mail)', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        requestCode({ email: owner.email, purpose: 'register', setupCode: SETUP_CODE }, `10.2.0.${i}`),
      ),
    );
    assert.ok(results.every((res) => res.statusCode === 202));
    assert.equal(sent.length, 1);
  });

  test('teto de 5 códigos por dia por e-mail', async () => {
    for (let i = 0; i < 6; i++) {
      await requestCode({ email: owner.email, purpose: 'register', setupCode: SETUP_CODE }, `10.3.0.${i}`);
      await ageCodes();
    }
    assert.equal(sent.length, 5);
  });

  test('rate limit por IP', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await requestCode({ email: `x${i}@x.com`, purpose: 'register', setupCode: SETUP_CODE }, '10.9.9.9');
      codes.push(res.statusCode);
    }
    assert.deepEqual(codes, [202, 202, 202, 202, 202, 429]);
  });
});

describe('POST /v1/auth/register com código de e-mail', () => {
  test('código certo cria a conta', async () => {
    await registerOwner();
  });

  test('sem código ou com código errado: INVALID_EMAIL_CODE', async () => {
    await requestCode({ email: owner.email, purpose: 'register', setupCode: SETUP_CODE });
    const code = lastCode();
    const wrong = code === '000000' ? '111111' : '000000';

    const missing = await register({});
    assert.equal(missing.statusCode, 400);
    assert.equal(missing.json().error.code, 'INVALID_EMAIL_CODE');

    const bad = await register({ emailCode: wrong });
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.json().error.code, 'INVALID_EMAIL_CODE');
  });

  test('pedir outro código não invalida o anterior (ninguém trava o dono)', async () => {
    await requestCode({ email: owner.email, purpose: 'register', setupCode: SETUP_CODE });
    const first = lastCode();
    await ageCodes();
    await requestCode({ email: owner.email, purpose: 'register', setupCode: SETUP_CODE }, '10.0.0.2');
    assert.equal(sent.length, 2);
    const res = await register({ emailCode: first });
    assert.equal(res.statusCode, 201, res.body);
  });

  test('código expirado não vale', async () => {
    await requestCode({ email: owner.email, purpose: 'register', setupCode: SETUP_CODE });
    await ctx.database.db.execute(sql`update email_codes set expires_at = now() - interval '1 second'`);
    const res = await register({ emailCode: lastCode() });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.code, 'INVALID_EMAIL_CODE');
  });

  test('código de outro e-mail não serve', async () => {
    await requestCode({ email: 'outra@pessoa.com', purpose: 'register', setupCode: SETUP_CODE });
    const res = await register({ emailCode: lastCode() });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.code, 'INVALID_EMAIL_CODE');
  });

  test('depois de 5 tentativas erradas nem o código certo vale', async () => {
    await requestCode({ email: owner.email, purpose: 'register', setupCode: SETUP_CODE });
    const code = lastCode();
    const wrong = code === '000000' ? '111111' : '000000';
    // IPs diferentes: o limite por código vale mesmo contornando o rate limit por IP.
    for (let i = 0; i < 5; i++) assert.equal((await register({ emailCode: wrong }, `10.1.0.${i}`)).statusCode, 400);
    const res = await register({ emailCode: code }, '10.1.0.99');
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.code, 'INVALID_EMAIL_CODE');
  });

  test('o código vale uma vez só', async () => {
    await registerOwner();
    // Mesmo que o cadastro reabrisse, o código já foi consumido: aqui o dono
    // existe, então o servidor responde REGISTRATION_CLOSED antes.
    const res = await register({ emailCode: '123456' });
    assert.equal(res.statusCode, 403);
  });

  test('código com formato errado vira INVALID_EMAIL_CODE', async () => {
    await requestCode({ email: owner.email, purpose: 'register', setupCode: SETUP_CODE });
    const res = await register({ emailCode: '12ab' });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.code, 'INVALID_EMAIL_CODE');
  });
});

describe('Esqueci a senha', () => {
  test('fluxo completo: código, nova senha, sessões antigas derrubadas', async () => {
    await registerOwner();
    const login = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: owner.email, password: owner.password },
    });
    const oldRefresh = login.json().refreshToken;

    const res = await requestCode({ email: owner.email, purpose: 'password_reset' });
    assert.equal(res.statusCode, 202);
    await waitForMail(1);
    assert.match(sent[0]?.subject ?? '', /redefinir/);

    const done = await reset({ email: owner.email, emailCode: lastCode(), newPassword: 'senha-nova-123' });
    assert.equal(done.statusCode, 204, done.body);

    const oldLogin = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: owner.email, password: owner.password },
    });
    assert.equal(oldLogin.statusCode, 401, 'senha antiga não entra mais');

    const newLogin = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: owner.email, password: 'senha-nova-123' },
    });
    assert.equal(newLogin.statusCode, 200);

    const refresh = await ctx.app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { refreshToken: oldRefresh } });
    assert.equal(refresh.statusCode, 401, 'sessão antiga derrubada');
  });

  test('corte de sessões: refresh anterior à troca de senha é recusado mesmo sem revogação', async () => {
    await registerOwner();
    const login = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: owner.email, password: owner.password },
    });
    // Simula a corrida: o token escapou do revokeAllForUser, mas o corte já existe.
    await ctx.database.db.execute(sql`update users set sessions_valid_after = now() + interval '1 second'`);
    const refresh = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: login.json().refreshToken },
    });
    assert.equal(refresh.statusCode, 401);
    assert.equal(refresh.json().error.code, 'INVALID_REFRESH_TOKEN');
  });

  test('e-mail não cadastrado: mesma resposta 202, nenhum e-mail enviado', async () => {
    await registerOwner();
    const res = await requestCode({ email: 'ninguem@exemplo.com', purpose: 'password_reset' });
    assert.equal(res.statusCode, 202);
    assert.deepEqual(res.json(), { expiresIn: 600, resendIn: 60 });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(sent.length, 0);
  });

  test('código de cadastro não serve para trocar a senha', async () => {
    await requestCode({ email: owner.email, purpose: 'register', setupCode: SETUP_CODE });
    const registerCode = lastCode();
    await register({ emailCode: registerCode });
    const res = await reset({ email: owner.email, emailCode: registerCode, newPassword: 'senha-nova-123' });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.code, 'INVALID_EMAIL_CODE');
  });

  test('nova senha curta vira VALIDATION_ERROR', async () => {
    const res = await reset({ email: owner.email, emailCode: '123456', newPassword: '123' });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.code, 'VALIDATION_ERROR');
  });
});

describe('Sem SMTP configurado', () => {
  test('email-code e password-reset respondem 503; cadastro segue sem código', async () => {
    const plain = await createTestApp();
    try {
      const code = await plain.app.inject({
        method: 'POST',
        url: '/v1/auth/email-code',
        payload: { email: owner.email, purpose: 'password_reset' },
      });
      assert.equal(code.statusCode, 503);
      assert.equal(code.json().error.code, 'SERVICE_UNAVAILABLE');

      const resetRes = await plain.app.inject({
        method: 'POST',
        url: '/v1/auth/password-reset',
        payload: { email: owner.email, emailCode: '123456', newPassword: 'senha-nova-123' },
      });
      assert.equal(resetRes.statusCode, 503);

      const reg = await plain.app.inject({ method: 'POST', url: '/v1/auth/register', payload: owner });
      assert.equal(reg.statusCode, 201);
    } finally {
      await plain.close();
    }
  });
});

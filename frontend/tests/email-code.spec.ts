import { test, expect } from '@playwright/test';
import { mockApi } from './helpers';

test('criar conta pede o código do e-mail antes de cadastrar', async ({ page, context }) => {
  const state = await mockApi(context);
  await page.goto('/');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByLabel('Nome').fill('Teste');
  await page.getByLabel('E-mail', { exact: true }).fill('teste@example.com');
  await page.locator('input[autocomplete="new-password"]').fill('senha-forte-1');
  await page.getByLabel('Código de configuração').fill('codigo-de-setup');
  await page.getByRole('button', { name: 'Continuar' }).click();

  await expect(page.getByRole('heading', { name: 'Confira seu e-mail.' })).toBeVisible();
  await expect(page.getByText('Digite o código enviado para teste@example.com.')).toBeVisible();
  expect(state.calls.find((call) => call.path.endsWith('/auth/email-code'))?.body)
    .toEqual({ email: 'teste@example.com', purpose: 'register', setupCode: 'codigo-de-setup' });
  await expect(page.getByRole('button', { name: /Reenviar código em \d+ s/ })).toBeDisabled();

  await page.getByLabel('Código de 6 dígitos').fill('123 456');
  await page.getByRole('button', { name: 'Confirmar e criar conta' }).click();
  await expect(page.getByRole('heading', { name: 'Confira seu e-mail.' })).toHaveCount(0);
  expect(state.calls.find((call) => call.path.endsWith('/auth/register'))?.body).toMatchObject({
    email: 'teste@example.com', name: 'Teste', setupCode: 'codigo-de-setup', emailCode: '123456',
  });
});

test('código errado mostra o erro e deixa reenviar depois da contagem', async ({ page, context }) => {
  const state = await mockApi(context);
  state.registerStatus = 400;
  await page.goto('/');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByLabel('Nome').fill('Teste');
  await page.getByLabel('E-mail', { exact: true }).fill('teste@example.com');
  await page.locator('input[autocomplete="new-password"]').fill('senha-forte-1');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('Código de 6 dígitos').fill('000000');
  await page.getByRole('button', { name: 'Confirmar e criar conta' }).click();
  await expect(page.getByRole('alert')).toContainText('Código inválido ou expirado');

  // O mock devolve resendIn = 2 s.
  const resend = page.getByRole('button', { name: 'Reenviar código', exact: true });
  await expect(resend).toBeEnabled({ timeout: 5000 });
  await resend.click();
  expect(state.calls.filter((call) => call.path.endsWith('/auth/email-code'))).toHaveLength(2);
});

test('esqueci minha senha: código + nova senha e volta ao login', async ({ page, context }) => {
  const state = await mockApi(context);
  await page.goto('/');
  await page.getByRole('button', { name: 'Esqueci minha senha' }).click();
  await expect(page.getByRole('heading', { name: 'Recupere seu acesso.' })).toBeVisible();
  await page.getByLabel('E-mail', { exact: true }).fill('teste@example.com');
  await page.getByRole('button', { name: 'Enviar código' }).click();

  await expect(page.getByRole('heading', { name: 'Defina uma nova senha.' })).toBeVisible();
  // Não revela se a conta existe.
  await expect(page.getByText('Se houver conta com esse e-mail, enviamos um código.', { exact: false })).toBeVisible();
  expect(state.calls.find((call) => call.path.endsWith('/auth/email-code'))?.body)
    .toEqual({ email: 'teste@example.com', purpose: 'password_reset' });

  await page.getByLabel('Código de 6 dígitos').fill('654321');
  await page.locator('input[autocomplete="new-password"]').fill('nova-senha-123');
  await page.getByRole('button', { name: 'Alterar senha' }).click();

  await expect(page.getByRole('heading', { name: 'Bom ter você de volta.' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Senha alterada. Entre com a nova senha.');
  expect(state.calls.find((call) => call.path.endsWith('/auth/password-reset'))?.body)
    .toEqual({ email: 'teste@example.com', emailCode: '654321', newPassword: 'nova-senha-123' });
});

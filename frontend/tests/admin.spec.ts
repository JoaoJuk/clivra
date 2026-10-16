import { test, expect } from '@playwright/test';
import { login, mockApi, openSettings } from './helpers';

test('admin vê o painel com sistema, pessoas e convites', async ({ page, context }) => {
  await mockApi(context);
  await login(page);
  await openSettings(page);
  const panel = page.locator('.admin-panel');
  await expect(panel.getByRole('heading', { name: 'Painel admin' })).toBeVisible();
  await expect(panel.getByText('Homologação')).toBeVisible();
  await expect(panel.getByText('No ar')).toBeVisible();
  await expect(panel.getByText('abc1234-20261016')).toBeVisible();
  await expect(panel.getByText('Teste (você)')).toBeVisible();
  await expect(panel.getByText('ana@example.com')).toBeVisible();
  await expect(panel.getByText('Nenhum convite pendente.')).toBeVisible();
});

test('admin convida, revoga, bloqueia e desconecta', async ({ page, context }) => {
  const state = await mockApi(context);
  page.on('dialog', (dialog) => dialog.accept());
  await login(page);
  await openSettings(page);
  const panel = page.locator('.admin-panel');

  await panel.getByLabel('Convidar por e-mail').fill('pedro@example.com');
  await panel.getByRole('button', { name: 'Enviar convite' }).click();
  await expect(page.getByText('Convite enviado para pedro@example.com.')).toBeVisible();
  await expect(panel.getByText('pedro@example.com')).toBeVisible();
  expect(state.calls.find((call) => call.path === '/v1/admin/invites' && call.body.email)?.body).toEqual({ email: 'pedro@example.com' });

  await panel.getByRole('button', { name: 'Revogar' }).click();
  await expect(panel.getByText('Nenhum convite pendente.')).toBeVisible();

  const ana = panel.locator('.admin-person', { hasText: 'ana@example.com' });
  await ana.getByRole('button', { name: 'Bloquear' }).click();
  await expect(ana.getByText('bloqueada')).toBeVisible();
  await expect(ana.getByRole('button', { name: 'Desbloquear' })).toBeVisible();

  await ana.getByRole('button', { name: 'Desconectar' }).click();
  await expect(ana.getByText('0 aparelhos')).toBeVisible();

  // O admin não tem botão de bloquear a si mesmo.
  const self = panel.locator('.admin-person', { hasText: 'Teste (você)' });
  await expect(self.getByRole('button', { name: 'Bloquear' })).toHaveCount(0);
});

test('member não vê o painel e não chama /v1/admin', async ({ page, context }) => {
  const state = await mockApi(context);
  state.role = 'member';
  await login(page);
  await openSettings(page);
  await expect(page.getByRole('heading', { name: 'Sair da conta' }).or(page.getByText('Sair da conta'))).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Painel admin' })).toHaveCount(0);
  expect(state.calls.some((call) => call.path.startsWith('/v1/admin/'))).toBe(false);
});

test('cadastro só por convite esconde o código de configuração', async ({ page, context }) => {
  const state = await mockApi(context);
  state.registrationMode = 'invite_only';
  await page.goto('/');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Use o e-mail que recebeu o convite do administrador.')).toBeVisible();
  await expect(page.getByLabel('Código de configuração')).toHaveCount(0);
  await page.getByLabel('Nome').fill('Ana');
  await page.getByLabel('E-mail', { exact: true }).fill('ana@example.com');
  await page.locator('input[autocomplete="new-password"]').fill('senha-da-ana');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Confira seu e-mail.' })).toBeVisible();
  expect(state.calls.find((call) => call.path.endsWith('/auth/email-code'))?.body).toEqual({ email: 'ana@example.com', purpose: 'register' });
});

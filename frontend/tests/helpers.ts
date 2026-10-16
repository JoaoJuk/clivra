import { expect, type BrowserContext, type Page } from '@playwright/test';

export async function mockApi(context: BrowserContext) {
  const state = { registrationMode: 'owner_setup', role: 'admin', authorized: false, refreshStatus: 200, logoutStatus: 204, codeStatus: 202, registerStatus: 201, resetStatus: 204, calls: [] as Array<{ path: string; body: Record<string, unknown> }> };
  const session = () => ({ accessToken: 'test-access', expiresIn: 900, user: { id: 'test-user', name: 'Teste', email: 'teste@example.com', role: state.role } });
  const admin = {
    users: [
      { id: 'test-user', email: 'teste@example.com', name: 'Teste', role: 'admin', createdAt: '2026-10-16T12:00:00Z', lastLoginAt: '2026-10-16T18:00:00Z', disabledAt: null, activeSessions: 1 },
      { id: '018f0000-0000-7000-8000-000000000001', email: 'ana@example.com', name: 'Ana', role: 'member', createdAt: '2026-10-16T12:00:00Z', lastLoginAt: null, disabledAt: null as string | null, activeSessions: 2 },
    ],
    invites: [] as Array<{ id: string; email: string; createdAt: string; expiresAt: string }>,
  };
  await context.route('**/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body = {};
    try { body = route.request().postDataJSON() || {}; } catch { /* Sem corpo. */ }
    state.calls.push({ path, body });
    const reply = (status: number, json?: unknown) => route.fulfill({ status, contentType: 'application/json', ...(status === 204 ? {} : { body: JSON.stringify(json) }) });
    const error = (status: number, code: string) => reply(status, { error: { code, message: code === 'INVALID_EMAIL_CODE' ? 'Código inválido ou expirado. Reenvie o código e tente novamente.' : 'Não foi possível concluir a solicitação.' } });
    if (path.endsWith('/health')) return reply(200, { status: 'ok', version: '1' });
    if (path.endsWith('/auth/registration')) return reply(200, { mode: state.registrationMode });
    if (path.startsWith('/v1/admin/')) {
      if (state.role !== 'admin') return error(403, 'FORBIDDEN');
      const method = route.request().method();
      if (path.endsWith('/admin/system')) return reply(200, { environment: 'staging', release: 'abc1234-20261016', startedAt: '2026-10-16T12:00:00Z', database: 'ok', lastBackupAt: null });
      if (path.endsWith('/admin/users')) return reply(200, { data: admin.users });
      if (path.endsWith('/admin/invites') && method === 'GET') return reply(200, { data: admin.invites });
      if (path.endsWith('/admin/invites') && method === 'POST') {
        const invite = { id: `inv-${admin.invites.length + 1}`, email: String((body as { email?: string }).email), createdAt: '2026-10-16T12:00:00Z', expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() };
        admin.invites.push(invite);
        return reply(201, invite);
      }
      const inviteMatch = path.match(/\/admin\/invites\/([^/]+)$/);
      if (inviteMatch && method === 'DELETE') { admin.invites = admin.invites.filter((item) => item.id !== inviteMatch[1]); return reply(204); }
      const userMatch = path.match(/\/admin\/users\/([^/]+)\/(disable|enable|revoke-sessions)$/);
      if (userMatch) {
        const person = admin.users.find((item) => item.id === userMatch[1]);
        if (person && userMatch[2] === 'disable') person.disabledAt = '2026-10-16T19:00:00Z';
        if (person && userMatch[2] === 'enable') person.disabledAt = null;
        if (person && userMatch[2] === 'revoke-sessions') person.activeSessions = 0;
        return reply(204);
      }
      return error(404, 'NOT_FOUND');
    }
    if (path.endsWith('/auth/refresh')) {
      if (state.refreshStatus !== 200) return error(state.refreshStatus, 'SERVICE_UNAVAILABLE');
      return state.authorized ? reply(200, session()) : error(401, 'INVALID_REFRESH_TOKEN');
    }
    if (path.endsWith('/auth/login')) { state.authorized = true; return reply(200, session()); }
    if (path.endsWith('/auth/email-code')) return state.codeStatus === 202 ? reply(202, { expiresIn: 600, resendIn: 2 }) : error(state.codeStatus, 'SERVICE_UNAVAILABLE');
    if (path.endsWith('/auth/register')) {
      if (state.registerStatus !== 201) return error(state.registerStatus, 'INVALID_EMAIL_CODE');
      state.authorized = true; return reply(201, session());
    }
    if (path.endsWith('/auth/password-reset')) return state.resetStatus === 204 ? reply(204) : error(state.resetStatus, 'INVALID_EMAIL_CODE');
    if (path.endsWith('/auth/logout')) {
      if (state.logoutStatus !== 204) return error(state.logoutStatus, 'SERVICE_UNAVAILABLE');
      state.authorized = false; return reply(204);
    }
    if (path.endsWith('/categories')) return reply(200, { data: [{ id: 'mercado', name: 'Mercado', group: 'essenciais', icon: 'cart', color: '#123456' }] });
    if (path.endsWith('/summary')) return reply(200, null);
    if (path.endsWith('/count')) return reply(200, { open: 0 });
    return reply(200, { data: [], page: { hasMore: false, nextCursor: null }, summary: { totalCents: 0, count: 0 } });
  });
  return state;
}

export async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('E-mail', { exact: true }).fill('teste@example.com');
  await page.locator('input[autocomplete="current-password"]').fill('test-password');
  await page.getByRole('button', { name: 'Entrar na conta' }).click();
  await expect(page.getByRole('button', { name: 'Entrar na conta' })).toHaveCount(0);
}

export async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Ajustes', exact: true }).filter({ visible: true }).click();
}

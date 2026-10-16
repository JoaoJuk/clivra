import { test, expect } from '@playwright/test';
import { login, mockApi, openSettings } from './helpers';

test('migra armazenamento legado e persiste apenas categorias', async ({ page, context }) => {
  await mockApi(context);
  await page.addInitScript(() => {
    localStorage.setItem('cartao.queryCache.v1', 'financial-legacy');
    localStorage.setItem('cartao.lastUser', JSON.stringify({ id: 'old', name: 'Old', email: 'old@example.com' }));
  });
  await login(page);
  await page.evaluate(async () => {
    const { queryClient } = await import('/src/lib/query.ts');
    queryClient.setQueryData(['transactions', 'sentinel'], { private: 'financial-sentinel' });
  });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cartao.queryCache.v2'))).toContain('categories');
  const saved = await page.evaluate(() => ({ cache: localStorage.getItem('cartao.queryCache.v2'), legacy: localStorage.getItem('cartao.queryCache.v1'), user: JSON.parse(localStorage.getItem('cartao.lastUser')!) }));
  expect(saved.legacy).toBeNull();
  expect(saved.cache).not.toContain('financial-sentinel');
  expect(saved.user).toEqual({ id: 'test-user', name: 'Teste' });
  const client = JSON.parse(saved.cache!).clientState;
  expect(client.queries.every((query: { queryKey: string[] }) => query.queryKey[0] === 'categories')).toBe(true);
  expect(client.mutations).toEqual([]);
});

for (const status of [429, 503]) test(`refresh ${status} online não abre sessão offline`, async ({ page, context }) => {
  const state = await mockApi(context);
  await login(page);
  state.refreshStatus = status;
  await page.reload();
  await expect(page.getByRole('button', { name: 'Entrar na conta' })).toBeVisible();
});

test('logout com falha mantém a sessão; sucesso limpa outras abas e IndexedDB', async ({ page, context }) => {
  const state = await mockApi(context);
  await login(page);
  const other = await context.newPage();
  await other.goto('/');
  await expect(other.getByRole('button', { name: 'Ajustes', exact: true }).filter({ visible: true })).toBeVisible();
  await openSettings(page);
  state.logoutStatus = 503;
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page.getByRole('button', { name: 'Sair da conta' })).toBeVisible();
  await expect(page.getByText(/Sua sessão continua aberta/)).toBeVisible();
  await page.evaluate(async () => {
    const { savePendingValue } = await import('/src/lib/pendingStore.ts');
    await savePendingValue('incoming', { text: 'private-share' });
    await savePendingValue('push-actions', { questionId: 'question', categoryId: 'mercado' });
  });
  state.logoutStatus = 204;
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page.getByRole('button', { name: 'Entrar na conta' })).toBeVisible();
  await expect(other.getByRole('button', { name: 'Entrar na conta' })).toBeVisible();
  expect(await page.evaluate(async () => {
    const { takePendingValue } = await import('/src/lib/pendingStore.ts');
    return [await takePendingValue('incoming'), await takePendingValue('push-actions')];
  })).toEqual([null, null]);
});

test('IndexedDB descarta itens antigos, sem data e futuros antes de consumir', async ({ page, context }) => {
  await mockApi(context);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Entrar na conta' })).toBeVisible();
  const result = await page.evaluate(async () => {
    const store = await import('/src/lib/pendingStore.ts');
    await store.prunePendingData(true);
    await new Promise<void>((resolve) => {
      const request = indexedDB.open('cartao-shared-text', 2);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('incoming', 'readwrite');
        for (const value of [{ text: 'legacy' }, { text: 'expired', createdAt: Date.now() - 600_001 }, { text: 'future', createdAt: Date.now() + 600_000 }, { text: 'fresh', createdAt: Date.now() }]) tx.objectStore('incoming').add(value);
        tx.oncomplete = () => { db.close(); resolve(); };
      };
    });
    return [await store.takePendingValue('incoming'), await store.takePendingValue('incoming')];
  });
  expect(result[0]).toMatchObject({ text: 'fresh' });
  expect(result[1]).toBeNull();
});

test('sessão offline vence em 24h e não é recriada só pelo lastUser', async ({ page, context }) => {
  await mockApi(context);
  await login(page);
  expect(await page.evaluate(async () => {
    const { readOfflineSession } = await import('/src/lib/sessionStorage.ts');
    const key = 'cartao.offlineSession.v2';
    const saved = JSON.parse(sessionStorage.getItem(key)!);
    const valid = Boolean(readOfflineSession());
    saved.validatedAt = Date.now() - 24 * 60 * 60 * 1000;
    sessionStorage.setItem(key, JSON.stringify(saved));
    const expired = readOfflineSession();
    sessionStorage.removeItem(key);
    return [valid, expired, readOfflineSession()];
  })).toEqual([true, null, null]);
});

test('logout desativa push antes de revogar sessão e mantém acesso se ficar sem rede', async ({ page, context }) => {
  const state = await mockApi(context);
  await login(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator.serviceWorker, 'getRegistration', { configurable: true, value: async () => ({
      pushManager: { getSubscription: async () => ({ endpoint: 'https://push.example/test', unsubscribe: async () => true }) },
    }) });
  });
  await context.route('**/v1/auth/logout', route => route.abort('internetdisconnected'));
  await openSettings(page);
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page.getByText(/Sua sessão continua aberta/)).toBeVisible();
  expect(state.calls.some(call => call.path === '/v1/push/subscribe')).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('cartao.lastUser'))).not.toBeNull();
  await context.unroute('**/v1/auth/logout');
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page.getByRole('button', { name: 'Entrar na conta' })).toBeVisible();
  const paths = state.calls.map(call => call.path);
  expect(paths.indexOf('/v1/push/subscribe')).toBeLessThan(paths.indexOf('/v1/auth/logout'));
});

test('refresh tardio não restaura sessão encerrada em outra aba', async ({ page, context }) => {
  await mockApi(context);
  await login(page);
  const other = await context.newPage();
  await other.goto('/');
  await expect(other.getByRole('button', { name: 'Ajustes', exact: true }).filter({ visible: true })).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void;
  const pending = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/v1/auth/refresh', async route => {
    started(); await gate;
    await route.fulfill({ json: { accessToken: 'late-token', expiresIn: 900, user: { id: 'test-user', name: 'Teste', email: 'teste@example.com' } } });
  });
  const refreshing = page.evaluate(async () => {
    const { api } = await import('/src/lib/api.ts');
    try { await api.refresh(); return 'restored'; } catch { return 'rejected'; }
  });
  await pending;
  await openSettings(other);
  await other.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page.getByRole('button', { name: 'Entrar na conta' })).toBeVisible();
  release();
  expect(await refreshing).toBe('rejected');
  expect(await page.evaluate(() => localStorage.getItem('cartao.lastUser'))).toBeNull();
});

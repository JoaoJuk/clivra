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
  expect(client.queries.every((query: { queryKey: string[] }) => query.queryKey[1] === 'test-user')).toBe(true);
  expect(client.mutations).toEqual([]);
});

test('descarta categorias persistidas quando o refresh troca de pessoa', async ({ page, context }) => {
  const state = await mockApi(context);
  await login(page);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cartao.queryCache.v2'))).toContain('mercado');

  state.userId = 'second-user';
  state.userName = 'Outra pessoa';
  state.categoryId = 'viagem';
  state.categoryName = 'Viagem';
  await page.reload();

  await openSettings(page);
  await expect(page.getByText('Outra pessoa', { exact: true }).filter({ visible: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cartao.queryCache.v2'))).toContain('second-user');
  const cache = await page.evaluate(() => localStorage.getItem('cartao.queryCache.v2'));
  expect(cache).toContain('viagem');
  expect(cache).not.toContain('mercado');
  expect(cache).not.toContain('test-user');
});

test('descarta cache de categorias sem identificação do último usuário', async ({ page, context }) => {
  const state = await mockApi(context);
  await login(page);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cartao.queryCache.v2'))).toContain('mercado');

  await page.evaluate(() => localStorage.removeItem('cartao.lastUser'));
  state.categoryId = 'transporte';
  state.categoryName = 'Transporte';
  await page.reload();

  await expect.poll(() => page.evaluate(() => localStorage.getItem('cartao.queryCache.v2'))).toContain('transporte');
  const cache = await page.evaluate(() => localStorage.getItem('cartao.queryCache.v2'));
  expect(cache).not.toContain('mercado');
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

test('logout continua quando a API de push falha e remove a inscrição local', async ({ page, context }) => {
  const state = await mockApi(context);
  await login(page);
  state.pushStatus = 404;
  await page.evaluate(() => {
    (window as Window & { pushUnsubscribed?: boolean }).pushUnsubscribed = false;
    Object.defineProperty(navigator.serviceWorker, 'getRegistration', { configurable: true, value: async () => ({
      pushManager: { getSubscription: async () => ({
        endpoint: 'https://push.example/test',
        unsubscribe: async () => { (window as Window & { pushUnsubscribed?: boolean }).pushUnsubscribed = true; return true; },
      }) },
    }) });
  });
  await openSettings(page);
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page.getByRole('button', { name: 'Entrar na conta' })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { pushUnsubscribed?: boolean }).pushUnsubscribed)).toBe(true);
  expect(state.calls.some(call => call.path === '/v1/push/subscribe')).toBe(true);
  expect(state.calls.some(call => call.path === '/v1/auth/logout')).toBe(true);
});

test('export usa proteções da sessão e rejeita resposta depois do logout', async ({ page, context }) => {
  await mockApi(context);
  await login(page);
  const result = await page.evaluate(async () => {
    const { api } = await import('/src/lib/api.ts');
    const originalFetch = window.fetch;
    let release!: () => void;
    let captured: RequestInit | undefined;
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/v1/export')) {
        captured = init;
        return new Promise<Response>((resolve) => { release = () => resolve(new Response('private-export')); });
      }
      return originalFetch(input, init);
    }) as typeof window.fetch;
    const exporting = api.exportTransactions({ format: 'csv' }).then(() => 'resolved').catch((error: { code?: string }) => error.code);
    while (!release) await new Promise(resolve => setTimeout(resolve, 0));
    api.clearSession();
    release();
    const outcome = await exporting;
    window.fetch = originalFetch;
    return { outcome, cache: captured?.cache, credentials: captured?.credentials };
  });
  expect(result).toEqual({ outcome: 'SESSION_ENDED', cache: 'no-store', credentials: 'include' });
});

test('export não conclui enquanto o logout ainda está em andamento', async ({ page, context }) => {
  await mockApi(context);
  await login(page);
  const outcome = await page.evaluate(async () => {
    const { api } = await import('/src/lib/api.ts');
    const originalFetch = window.fetch;
    let releaseExport!: () => void;
    let releaseLogout!: () => void;
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/v1/export')) {
        return new Promise<Response>((resolve) => { releaseExport = () => resolve(new Response('private-export')); });
      }
      if (url.includes('/v1/auth/logout')) {
        return new Promise<Response>((resolve) => { releaseLogout = () => resolve(new Response(null, { status: 204 })); });
      }
      return originalFetch(input, init);
    }) as typeof window.fetch;
    const exporting = api.exportTransactions({ format: 'csv' }).then(() => 'resolved').catch((error: { code?: string }) => error.code);
    while (!releaseExport) await new Promise(resolve => setTimeout(resolve, 0));
    const loggingOut = api.logout();
    while (!releaseLogout) await new Promise(resolve => setTimeout(resolve, 0));
    releaseExport();
    const result = await exporting;
    releaseLogout();
    await loggingOut;
    window.fetch = originalFetch;
    return result;
  });
  expect(outcome).toBe('SESSION_ENDING');
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

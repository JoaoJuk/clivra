import { QueryClient } from '@tanstack/react-query';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';
import { ApiError } from './api';

const queryCacheKey = 'cartao.queryCache.v2';
const persistThrottleTime = 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 24 * 60 * 60 * 1000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status < 500) return false;
        return failureCount < 1;
      },
    },
  },
});

let availableStorage: Storage | undefined;
try { availableStorage = window.localStorage; } catch { availableStorage = undefined; }

let persistTimer: ReturnType<typeof setTimeout> | undefined;
let pendingClient: PersistedClient | undefined;

// O removeClient cancela a gravação pendente para o cache apagado no logout
// ou na troca de pessoa não reaparecer por causa do throttle.
export const queryPersister: Persister = {
  persistClient(client: PersistedClient): void {
    if (!availableStorage) return;
    pendingClient = client;
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = undefined;
      const clientToPersist = pendingClient;
      pendingClient = undefined;
      try { availableStorage?.setItem(queryCacheKey, JSON.stringify(clientToPersist)); } catch { /* Cache offline opcional. */ }
    }, persistThrottleTime);
  },
  restoreClient(): PersistedClient | undefined {
    if (!availableStorage) return undefined;
    try {
      const value = availableStorage.getItem(queryCacheKey);
      return value ? JSON.parse(value) : undefined;
    } catch { return undefined; }
  },
  removeClient(): void {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = undefined;
    pendingClient = undefined;
    try { availableStorage?.removeItem(queryCacheKey); } catch { /* Cache offline opcional. */ }
  },
};

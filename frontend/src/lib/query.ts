import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { ApiError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 7 * 24 * 60 * 60 * 1000,
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

export const queryPersister = createSyncStoragePersister({
  storage: availableStorage,
  key: 'cartao.queryCache.v1',
  throttleTime: 1000,
});

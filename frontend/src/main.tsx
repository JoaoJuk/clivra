import React from 'react';
import ReactDOM from 'react-dom/client';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { App } from './App';
import { queryClient, queryPersister } from './lib/query';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister, maxAge: 24 * 60 * 60 * 1000, buster: 'categories-by-user-v3',
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => query.queryKey[0] === 'categories'
            && typeof query.queryKey[1] === 'string'
            && query.state.status === 'success',
          shouldDehydrateMutation: () => false,
        },
      }}
    >
      <App />
    </PersistQueryClientProvider>
  </React.StrictMode>,
);

import React from 'react';
import ReactDOM from 'react-dom/client';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { App } from './App';
import { queryClient, queryPersister } from './lib/query';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: queryPersister, maxAge: 7 * 24 * 60 * 60 * 1000, buster: 'contract-v1' }}
    >
      <App />
    </PersistQueryClientProvider>
  </React.StrictMode>,
);

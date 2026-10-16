import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { connectPglite } from '../src/db/client.js';

export const TEST_ORIGIN = 'http://localhost:5173';

// App novo com banco Postgres em memória — cada teste começa do zero.
export async function createTestApp(env: Record<string, string> = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    JWT_SECRET: 'test-secret-that-is-long-enough-for-hs256-signing',
    CORS_ORIGINS: TEST_ORIGIN,
    ...env,
  });
  const database = connectPglite('memory://');
  await database.migrate();
  const app = await buildApp(config, database);
  return {
    app,
    async close() {
      await app.close();
      await database.close();
    },
  };
}

export const owner = { email: 'Voce@Exemplo.com', password: 'minhasenha123', name: 'João' };

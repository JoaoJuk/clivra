import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import pg from 'pg';
import * as schema from './schema.js';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface Database {
  db: Db;
  migrate(): Promise<void>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

// Mesmo caminho a partir de src/db (tsx) e de dist/db (build).
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

// Produção: Postgres de verdade na VPS (D4).
export function connectPostgres(url: string): Database {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  const db = drizzlePg({ client: pool, schema });
  return {
    db,
    migrate: () => migratePg(db, { migrationsFolder }),
    ping: async () => {
      await db.execute(sql`select 1`);
    },
    close: () => pool.end(),
  };
}

// Dev e testes: Postgres embutido (PGlite), sem Docker. `memory://` = descartável.
export function connectPglite(dataDir: string): Database {
  const client = new PGlite(dataDir);
  const db = drizzlePglite({ client, schema });
  return {
    db,
    migrate: () => migratePglite(db, { migrationsFolder }),
    ping: async () => {
      await db.execute(sql`select 1`);
    },
    close: () => client.close(),
  };
}

import { defineConfig } from 'drizzle-kit';

// Só gera os arquivos SQL de migration a partir do schema; não conecta em banco.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
});

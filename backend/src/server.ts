import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { connectPglite, connectPostgres } from './db/client.js';

const config = loadConfig();
const database = config.DATABASE_URL ? connectPostgres(config.DATABASE_URL) : connectPglite(config.PGLITE_DIR);

await database.migrate();
const app = await buildApp(config, database);

async function shutdown(signal: string) {
  app.log.info(`${signal} recebido, encerrando`);
  await app.close();
  await database.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: config.HOST, port: config.PORT });

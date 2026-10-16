import type { FastifyInstance } from 'fastify';
import type { Database } from '../db/client.js';
import { errors } from '../lib/errors.js';

const API_VERSION = '1.0.0';

export async function healthRoutes(app: FastifyInstance, opts: { database: Database }): Promise<void> {
  app.get('/v1/health', async () => {
    try {
      await opts.database.ping();
    } catch {
      throw errors.serviceUnavailable();
    }
    return { status: 'ok', version: API_VERSION };
  });
}

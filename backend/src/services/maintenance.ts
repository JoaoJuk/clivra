import type { Db } from '../db/client.js';
import { deleteStaleInvites } from '../db/invites.js';
import { deleteRefreshTokensExpiredBefore } from '../db/refresh-tokens.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Limpeza periódica: cada refresh grava um token novo, então sem isto a
// tabela refresh_tokens só cresceria.
export function createMaintenance(deps: { db: Db }) {
  return {
    async run(now = new Date()): Promise<void> {
      await deleteRefreshTokensExpiredBefore(deps.db, new Date(now.getTime() - DAY_MS));
      await deleteStaleInvites(deps.db, new Date(now.getTime() - 7 * DAY_MS));
    },
  };
}

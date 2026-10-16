import { readFile } from 'node:fs/promises';
import type { Database } from '../db/client.js';
import { toIso } from '../lib/ids.js';

// Saúde do sistema para o painel do admin. Nada de dado de usuário aqui.
export interface SystemStatus {
  environment: 'production' | 'staging' | 'development';
  release: string;
  startedAt: string;
  database: 'ok' | 'error';
  lastBackupAt: string | null;
}

interface ReleaseInfo {
  release: string;
  environment: SystemStatus['environment'];
}

const startedAt = toIso(new Date());

// release.json é gravado pelo deploy.sh na raiz da release (ao lado de dist/).
async function readRelease(path: URL): Promise<ReleaseInfo> {
  try {
    const raw: unknown = JSON.parse(await readFile(path, 'utf8'));
    if (typeof raw === 'object' && raw !== null && 'release' in raw && 'environment' in raw) {
      const { release, environment } = raw;
      if (typeof release === 'string' && /^[\w.-]{1,64}$/.test(release)) {
        if (environment === 'prod') return { release, environment: 'production' };
        if (environment === 'hml') return { release, environment: 'staging' };
      }
    }
  } catch {
    // Sem release.json: rodando local (npm run dev / testes).
  }
  return { release: 'dev', environment: 'development' };
}

async function readLastBackup(path: string): Promise<string | null> {
  try {
    const text = (await readFile(path, 'utf8')).trim();
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(text) ? text : null;
  } catch {
    return null;
  }
}

export function createSystemService(deps: {
  database: Database;
  releaseFile?: URL;
  backupStatusFile?: string;
}) {
  const releaseFile = deps.releaseFile ?? new URL('../../release.json', import.meta.url);
  const backupStatusFile = deps.backupStatusFile ?? '/var/lib/clivra/last-backup';

  return {
    async status(): Promise<SystemStatus> {
      const info = await readRelease(releaseFile);
      let database: SystemStatus['database'] = 'ok';
      try {
        await deps.database.ping();
      } catch {
        database = 'error';
      }
      return {
        environment: info.environment,
        release: info.release,
        startedAt,
        database,
        // O backup diário existe só na produção (a homologação tem dados de teste).
        lastBackupAt: info.environment === 'production' ? await readLastBackup(backupStatusFile) : null,
      };
    },
  };
}

export type SystemService = ReturnType<typeof createSystemService>;

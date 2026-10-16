export const userStorageKey = 'cartao.lastUser';
export const logoutStorageKey = 'cartao.logoutVersion';
const offlineStorageKey = 'cartao.offlineSession.v2';
export const offlineMaxAge = 24 * 60 * 60 * 1000;
export type SessionUser = { id: string; name: string; email?: string };

export function readStorage(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* Armazenamento indisponível. */ }
}

// Migração: nenhum e-mail, token ou cache financeiro legado permanece no disco.
writeStorage('cartao.refreshToken', null);
writeStorage('cartao.queryCache.v1', null);
try {
  const old = JSON.parse(readStorage(userStorageKey) || 'null');
  writeStorage(userStorageKey, old && typeof old.id === 'string' && typeof old.name === 'string'
    ? JSON.stringify({ id: old.id, name: old.name }) : null);
} catch { writeStorage(userStorageKey, null); }

export function rememberOfflineSession(user: SessionUser): void {
  const safeUser = { id: user.id, name: user.name };
  writeStorage(userStorageKey, JSON.stringify(safeUser));
  try {
    sessionStorage.setItem(offlineStorageKey, JSON.stringify({
      user: safeUser, validatedAt: Date.now(), logoutVersion: readStorage(logoutStorageKey),
    }));
  } catch { /* Sem armazenamento, o acesso exige rede. */ }
}

export function readOfflineSession(): { user: SessionUser; expiresAt: number } | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(offlineStorageKey) || 'null');
    const age = Date.now() - value?.validatedAt;
    if (!value || !Number.isFinite(age) || age < 0 || age >= offlineMaxAge
      || value.logoutVersion !== readStorage(logoutStorageKey)
      || typeof value.user?.id !== 'string' || typeof value.user?.name !== 'string'
      || !readStorage(userStorageKey)) return null;
    return { user: { id: value.user.id, name: value.user.name }, expiresAt: value.validatedAt + offlineMaxAge };
  } catch { return null; }
}

export function clearOfflineSession(): void {
  writeStorage(userStorageKey, null);
  try { sessionStorage.removeItem(offlineStorageKey); } catch { /* Sem armazenamento. */ }
}

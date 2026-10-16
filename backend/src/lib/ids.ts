import { v7 } from 'uuid';

// IDs são UUID v7 (ordenáveis por tempo) — AGENTS.md §6.
export function newId(): string {
  return v7();
}

// Contrato §0: datas em UTC ISO 8601 com "Z", sem milissegundos.
export function toIso(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

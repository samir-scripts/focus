import { catalog } from './sites/catalog';

export type Snapshot = { revision: number; sites: { id: string; rules: Record<string, boolean> }[] };
export type NativeReply = { v: 1; id: string; ok: true; body: Record<string, unknown> } | { v: 1; id: string; ok: false; error: { code: string } };

export function validSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  if (!Number.isSafeInteger(body.revision) || (body.revision as number) < 0 || !Array.isArray(body.sites)) return false;
  return body.sites.every((site: unknown) => {
    if (!site || typeof site !== 'object') return false;
    const entry = site as Record<string, unknown>;
    if (typeof entry.id !== 'string' || !catalog.some((site) => site.id === entry.id) || !entry.rules || typeof entry.rules !== 'object' || Array.isArray(entry.rules)) return false;
    return Object.entries(entry.rules).every(([id, enabled]) => entry.id === 'youtube' && id === 'youtube.hide-shorts' && typeof enabled === 'boolean');
  });
}

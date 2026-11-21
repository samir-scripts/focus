import { catalog } from './sites/catalog';

export const VERSION = 3;
export type EntryPolicy = { mode: 'allow' } | { mode: 'block' } |
  { mode: 'pause'; seconds: number; finish: 'manual' | 'auto'; frequency: 'visit' | 'page' };
export type SitePolicy = {
  id: string; label: string; hosts: string[]; grayscale: boolean; entry: EntryPolicy; rules: Record<string, boolean>;
};
type LegacySite = Pick<SitePolicy, 'id' | 'rules'>;
export type Accessibility = { holdSeconds: number; twoStepConfirmation: boolean };
export type Snapshot = { revision: number; sites: (SitePolicy | LegacySite)[]; accessibility?: Accessibility };
export type PolicySnapshot = { revision: number; sites: SitePolicy[]; accessibility: Accessibility };

export function normalizeHost(value: string): string | undefined {
  const hostname = value.trim().replace(/\.+$/, '');
  if (!hostname || /[\s/\\:?#@*%]/u.test(hostname)) return undefined;
  try {
    const host = new URL(`https://${hostname}/`).hostname;
    if (host.length <= 253 && host.includes('.') && !/^\d+(?:\.\d+){3}$/.test(host) &&
      host.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return host;
  } catch { /* invalid authority */ }
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function keys(value: Record<string, unknown>, ...expected: string[]) {
  return Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function validEntry(value: unknown): value is EntryPolicy {
  if (!record(value)) return false;
  if (value.mode === 'allow' || value.mode === 'block') return keys(value, 'mode');
  return value.mode === 'pause' && keys(value, 'mode', 'seconds', 'finish', 'frequency')
    && typeof value.seconds === 'number' && Number.isInteger(value.seconds) && value.seconds >= 5 && value.seconds <= 600
    && (value.finish === 'manual' || value.finish === 'auto') && (value.frequency === 'visit' || value.frequency === 'page');
}

function validAccessibility(value: unknown): value is Accessibility {
  return record(value) && keys(value, 'holdSeconds', 'twoStepConfirmation')
    && typeof value.holdSeconds === 'number' && Number.isInteger(value.holdSeconds)
    && value.holdSeconds >= 15 && value.holdSeconds <= 600 && typeof value.twoStepConfirmation === 'boolean';
}

export function validSnapshot(value: unknown): value is Snapshot {
  if (!record(value) || !(keys(value, 'revision', 'sites') ||
    keys(value, 'revision', 'sites', 'accessibility') && validAccessibility(value.accessibility))) return false;
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || !Array.isArray(value.sites)) return false;
  const ids = new Set<string>();
  return value.sites.every((entry: unknown) => {
    if (!record(entry) || typeof entry.id !== 'string' || !record(entry.rules) || ids.has(entry.id)) return false;
    ids.add(entry.id);
    if (!Object.entries(entry.rules).every(([id, enabled]) => entry.id === 'youtube' && id === 'youtube.hide-shorts' && typeof enabled === 'boolean')) return false;
    const known = catalog.find((site) => site.id === entry.id);
    if (keys(entry, 'id', 'rules')) return !!known; // Only for migrating an acknowledged v1 cache.
    if (!keys(entry, 'id', 'label', 'hosts', 'grayscale', 'entry', 'rules') || typeof entry.grayscale !== 'boolean'
      || !validEntry(entry.entry) || !Array.isArray(entry.hosts)) return false;
    if (known) return entry.label === known.label && entry.hosts.length === known.hosts.length
      && known.hosts.every((host, index) => host === (entry.hosts as unknown[])[index]);
    const [host] = entry.hosts;
    return entry.hosts.length === 1 && typeof host === 'string' && normalizeHost(host) === host
      && entry.id === `custom:${host}` && entry.label === host && !catalog.some((site) => site.hosts.includes(host));
  });
}

export function validPolicySnapshot(value: unknown): value is PolicySnapshot {
  return validSnapshot(value) && validAccessibility(value.accessibility) && value.sites.every((site) => 'entry' in site);
}

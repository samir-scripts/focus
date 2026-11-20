import { invoke } from '@tauri-apps/api/core';
import { siteOrigins } from '../../extension/src/permissions';

export const browsers = {
  chrome: 'Chrome', chromium: 'Chromium', brave: 'Brave', firefox: 'Firefox', zen: 'Zen',
} as const;
export type Browser = keyof typeof browsers;
export type Pair = { id: string; label: string; browser: Browser };
export type Profile = Pair & { online: boolean; ackRevision: number | null; origins: string[] };
export type Registration = { browser: Browser; matched: boolean; manifestPath: string | null; manifest: string | null };
export type BrowserState = {
  revision: number;
  hideShorts: boolean;
  pending: Pair[];
  profiles: Profile[];
  open: { siteId: string | null } | null;
};

export interface BrowserBridge {
  state: () => Promise<BrowserState>;
  registrations: () => Promise<Registration[]>;
  setHideShorts: (expectedRevision: number, enabled: boolean) => Promise<void>;
  decidePair: (id: string, approved: boolean, label: string | null) => Promise<void>;
  revoke: (id: string) => Promise<void>;
}

export const nativeBrowserBridge: BrowserBridge = {
  state: () => invoke('browser_state'),
  registrations: () => invoke('browser_registrations'),
  setHideShorts: (expectedRevision, enabled) => invoke('set_hide_shorts', { expectedRevision, enabled }),
  decidePair: (id, approved, label) => invoke('decide_browser_pair', { id, approved, label }),
  revoke: (id) => invoke('revoke_browser_profile', { id }),
};
export function siteAccess(profile: Profile, site: { id: string; hosts: readonly string[] }, revision: number) {
  if (!profile.online) return { status: 'Disconnected', origins: [], missing: [] };
  const origins = profile.origins.filter((origin) => site.hosts.includes(new URL(origin).hostname));
  const required = siteOrigins(site.id).filter((origin) => site.id !== 'youtube' || new URL(origin).hostname !== 'youtu.be');
  const missing = required.filter((origin) => !origins.includes(origin));
  if (profile.ackRevision === null) return { status: 'Applying', origins, missing: [] };
  if (missing.length) return { status: 'Needs access', origins, missing };
  if (site.id !== 'youtube') return { status: 'Access granted · no rules in this build', origins, missing };
  return { status: profile.ackRevision === revision ? 'Applied' : 'Applying', origins, missing };
}

import { invoke } from '@tauri-apps/api/core';
import { hostOrigins } from '../../extension/src/permissions';
import type { Accessibility, EntryPolicy, SitePolicy } from '../../extension/src/protocol';

export const browsers = {
  chrome: 'Chrome', chromium: 'Chromium', brave: 'Brave', firefox: 'Firefox', zen: 'Zen',
} as const;
export type Browser = keyof typeof browsers;
export type ContentRules =
  | { site: 'x'; hideForYou: boolean; openFollowing: boolean }
  | { site: 'reddit'; hideRecommendations: boolean; hideAllHome: boolean }
  | { site: 'youtube'; hideShorts: boolean; hideHomeRecommendations: boolean };
export type Pair = { id: string; label: string; browser: Browser };
export type Profile = Pair & { online: boolean; updateRequired?: boolean; ackRevision: number | null; origins: string[] };
export type InstallCapability = 'store' | 'managed' | 'managedPending' | 'managedCleanup' | 'managedOrphan' | 'missingArtifact' |
  'invalidArtifact' | 'missingBridge' | 'missingAuthorization' | 'sharedTarget' |
  'managedElsewhere' | 'conflictingSetup' | 'missingPortal' | 'unverifiedChannel';
export type BrowserTarget = {
  id: string;
  browser: Browser;
  source: 'bundle' | 'native' | 'snap' | 'flatpak' | 'standalone';
  label: string;
  capability: InstallCapability;
};
export type BrowserScan = { supported: boolean; targets: BrowserTarget[] };
export type InstallOutcome = 'storeOpened' | 'signedPending' | 'policyRemoved' | 'cancelled';
export type BrowserState = {
  revision: number;
  hideShorts: boolean;
  accessibility: Accessibility;
  sites: SitePolicy[];
  entryAvailable?: boolean;
  pending: Pair[];
  profiles: Profile[];
  open: { siteId: string | null } | null;
};

export interface BrowserBridge {
  state: () => Promise<BrowserState>;
  scan: () => Promise<BrowserScan>;
  install: (targetId: string) => Promise<InstallOutcome>;
  removeInstallation: (targetId: string) => Promise<InstallOutcome>;
  setContentRules: (expectedRevision: number, rules: ContentRules) => Promise<void>;
  setGrayscale: (expectedRevision: number, siteId: string, enabled: boolean) => Promise<void>;
  setEntry: (expectedRevision: number, siteId: string, entry: EntryPolicy) => Promise<void>;
  setAccessibility: (expectedRevision: number, accessibility: Accessibility) => Promise<void>;
  designateSite: (host: string) => Promise<string>;
  decidePair: (id: string, approved: boolean, label: string | null) => Promise<void>;
  revoke: (id: string) => Promise<void>;
}

export const nativeBrowserBridge: BrowserBridge = {
  state: () => invoke('browser_state'),
  scan: () => invoke('scan_browsers'),
  install: (targetId) => invoke('start_browser_installation', { targetId }),
  removeInstallation: (targetId) => invoke('remove_browser_installation', { targetId }),
  setContentRules: (expectedRevision, rules) => invoke('set_content_rules', { expectedRevision, rules }),
  setGrayscale: (expectedRevision, siteId, enabled) => invoke('set_grayscale', { expectedRevision, siteId, enabled }),
  setEntry: (expectedRevision, siteId, entry) => invoke('set_entry', { expectedRevision, siteId, entry }),
  setAccessibility: (expectedRevision, accessibility) => invoke('set_accessibility', { expectedRevision, accessibility }),
  designateSite: (host) => invoke('designate_site', { host }),
  decidePair: (id, approved, label) => invoke('decide_browser_pair', { id, approved, label }),
  revoke: (id) => invoke('revoke_browser_profile', { id }),
};
export function siteAccess(profile: Profile, site: { id: string; hosts: readonly string[] }, revision: number, entry?: EntryPolicy) {
  if (!profile.online) return { status: 'Disconnected', origins: [], missing: [] };
  if (profile.updateRequired) return { status: 'Update required', origins: [], missing: [] };
  const origins = profile.origins.filter((origin) => site.hosts.includes(new URL(origin).hostname));
  const required = hostOrigins(site.hosts.filter((host) => host !== 'youtu.be' || entry && entry.mode !== 'allow' || site.id !== 'youtube'));
  const missing = required.filter((origin) => !origins.includes(origin));
  if (profile.ackRevision === null) return { status: 'Applying', origins, missing: [] };
  if (missing.length) return { status: 'Needs access', origins, missing };
  return { status: profile.ackRevision === revision ? 'Applied' : 'Applying', origins, missing };
}

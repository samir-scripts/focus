export type EntryRule = {
  id: number;
  priority: number;
  condition: { regexFilter: string; isUrlFilterCaseSensitive: true; resourceTypes: ['main_frame']; tabIds?: number[] };
  action: { type: 'block' | 'allow' } | { type: 'redirect'; redirect: { regexSubstitution: string } };
};

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hostPrefix = (pattern: string) => escape(pattern.slice(0, -2)) + '(:[0-9]+)?/';

export function webTarget(input: string): URL | undefined {
  try {
    const url = new URL(input);
    if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password) return url;
  } catch { /* An invalid target cannot receive a pass. */ }
}

export function documentKey(input: string) {
  const url = webTarget(input);
  if (!url) return undefined;
  url.hash = '';
  return url.href;
}

export function matchPattern(url: URL) {
  return `${url.protocol}//${url.hostname}/*`;
}

export function entryRules(gates: ReadonlyMap<string, 'pause' | 'block'>, entryPage: string): EntryRule[] {
  return [...gates].map(([pattern, mode], index) => ({
    id: index + 1,
    priority: mode === 'block' ? 30 : 10,
    condition: { regexFilter: `^${hostPrefix(pattern)}.*$`, isUrlFilterCaseSensitive: true, resourceTypes: ['main_frame'] },
    action: mode === 'block' ? { type: 'block' } : { type: 'redirect', redirect: { regexSubstitution: `${entryPage}#\\0` } },
  }));
}
function visitPattern(origins: string[]) {
  const hosts = new Map<string, number>();
  for (const origin of origins) {
    const [scheme, host] = origin.slice(0, -2).split('://');
    hosts.set(host, (hosts.get(host) ?? 0) | (scheme === 'https' ? 2 : 1));
  }
  const groups: string[] = [];
  for (const [mask, scheme] of [[3, 'https?'], [1, 'http'], [2, 'https']] as const) {
    const names = [...hosts].filter(([, value]) => value === mask).map(([host]) => escape(host));
    if (names.length) groups.push(`${scheme}://(?:${names.join('|')})`);
  }
  return groups.length ? `^(?:${groups.join('|')})(:[0-9]+)?/` : '^$';
}


export function passRule(id: number, tabId: number, origins: string[], target?: string): EntryRule {
  const regexFilter = target === undefined ? visitPattern(origins) : `^${escape(documentKey(target)!)}$`;
  return { id, priority: 20, action: { type: 'allow' }, condition: { regexFilter, isUrlFilterCaseSensitive: true, resourceTypes: ['main_frame'], tabIds: [tabId] } };
}

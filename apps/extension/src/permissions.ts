import { catalog } from './sites/catalog';

export function siteOrigins(siteId: string): string[] {
  const site = catalog.find((entry) => entry.id === siteId);
  return site ? site.hosts.flatMap((host) => [`http://${host}/*`, `https://${host}/*`]) : [];
}

// Browsers may collapse the two schemes to *://. Wildcard hosts are never accepted.
export function grantedOrigins(patterns: readonly string[]): string[] {
  const origins = new Set<string>();
  for (const pattern of patterns) {
    const match = /^(https?|\*):\/\/([a-z0-9.-]+)\/\*$/.exec(pattern);
    if (!match) continue;
    const [, scheme, host] = match;
    if (scheme === '*') {
      origins.add(`http://${host}/*`);
      origins.add(`https://${host}/*`);
    } else origins.add(`${scheme}://${host}/*`);
  }
  return [...origins];
}

export function missingOrigins(required: readonly string[], granted: readonly string[]): string[] {
  const have = new Set(grantedOrigins(granted));
  return required.filter((origin) => !have.has(origin));
}

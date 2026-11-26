import definitions from './catalog.json';

export type SiteDefinition = { id: string; label: string; hosts: readonly string[]; home?: string; homeSince?: number; rules: readonly { id: string; label: string }[] };
export const catalog: readonly SiteDefinition[] = definitions;

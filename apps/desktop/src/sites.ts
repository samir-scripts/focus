import { catalog } from '../../extension/src/sites/catalog';

export const sites = catalog.map((site) => ({ ...site, hostname: site.hosts[0] }));

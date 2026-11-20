import { describe, expect, it } from 'vitest';
import { grantedOrigins, missingOrigins, siteOrigins } from '../../apps/extension/src/permissions';

describe('site permission accounting', () => {
  it('expands browser scheme grants without granting subdomains', () => {
    expect(grantedOrigins(['*://youtube.com/*', 'https://*.youtube.com/*'])).toEqual(['http://youtube.com/*', 'https://youtube.com/*']);
  });
  it('requests only missing explicit origins', () => {
    const required = siteOrigins('youtube');
    expect(missingOrigins(required, ['*://youtube.com/*', 'https://www.youtube.com/*'])).toEqual([
      'http://www.youtube.com/*', 'http://m.youtube.com/*', 'https://m.youtube.com/*', 'http://youtu.be/*', 'https://youtu.be/*',
    ]);
  });
});

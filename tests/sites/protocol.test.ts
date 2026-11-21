import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validSnapshot } from '../../apps/extension/src/protocol';

const fixtures = JSON.parse(readFileSync('tests/protocol/v1.json', 'utf8'));
describe('protocol snapshot compatibility', () => {
  it('accepts the shared v1 snapshot', () => {
    expect(validSnapshot(fixtures.snapshot.body)).toBe(true);
  });
  it('rejects unknown rules and malformed values rather than discarding supported policy', () => {
    expect(validSnapshot({ revision: 8, sites: [{ id: 'youtube', rules: { 'youtube.future': true } }] })).toBe(false);
    expect(validSnapshot({ revision: 8, sites: [{ id: 'youtube', rules: { 'youtube.hide-shorts': 'true' } }] })).toBe(false);
  });
  it('accepts a complete v2 policy for a designated exact host', () => {
    const site = { id: 'custom:xn--bcher-kva.example', label: 'xn--bcher-kva.example',
      hosts: ['xn--bcher-kva.example'], grayscale: true, rules: {},
      entry: { mode: 'pause', seconds: 15, frequency: 'visit', finish: 'manual' } };
    expect(validSnapshot({ revision: 8, sites: [site] })).toBe(true);
    expect(validSnapshot({ revision: 8, sites: [{ ...site, hosts: ['*.xn--bcher-kva.example'] }] })).toBe(false);
    expect(validSnapshot({ revision: 8, sites: [{ ...site, entry: { ...site.entry, seconds: 4 } }] })).toBe(false);
  });
});

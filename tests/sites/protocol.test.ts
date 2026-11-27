import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validPolicySnapshot, validSnapshot } from '../../apps/extension/src/protocol';

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
  it('requires a complete, bounded accessibility object for current policy', () => {
    const site = { id: 'custom:example.com', label: 'example.com', hosts: ['example.com'],
      grayscale: false, rules: {}, entry: { mode: 'allow' } };
    const policy = { revision: 8, sites: [site], accessibility: { holdSeconds: 15, twoStepConfirmation: false } };
    expect(validPolicySnapshot(policy)).toBe(true);
    expect(validPolicySnapshot({ revision: 8, sites: [site] })).toBe(false);
    for (const holdSeconds of [14, 601, 15.5, NaN]) {
      expect(validPolicySnapshot({ ...policy, accessibility: { ...policy.accessibility, holdSeconds } })).toBe(false);
    }
    expect(validPolicySnapshot({ ...policy, accessibility: { ...policy.accessibility, twoStepConfirmation: 'false' } })).toBe(false);
    expect(validPolicySnapshot({ ...policy, accessibility: { ...policy.accessibility, extra: true } })).toBe(false);
  });
  it('accepts independent YouTube choices and rejects rules assigned to the wrong site', () => {
    const site = { id: 'youtube', label: 'YouTube', hosts: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'],
      grayscale: false, entry: { mode: 'allow' }, rules: { 'youtube.hide-shorts': true, 'youtube.hide-home-recommendations': true } };
    const policy = { revision: 8, sites: [site], accessibility: { holdSeconds: 15, twoStepConfirmation: false } };
    expect(validPolicySnapshot(policy)).toBe(true);
    expect(validPolicySnapshot({ ...policy, sites: [{ ...site, rules: { 'x.hide-for-you': false } }] })).toBe(false);
  });
  it('accepts all four independent Instagram selections', () => {
    for (const suggested of [false, true]) for (const reels of [false, true]) {
      const site = { id: 'instagram', label: 'Instagram', hosts: ['instagram.com', 'www.instagram.com'],
        grayscale: false, entry: { mode: 'allow' },
        rules: { 'instagram.hide-suggested-home': suggested, 'instagram.hide-reels-discovery': reels } };
      expect(validPolicySnapshot({ revision: 8, sites: [site], accessibility: { holdSeconds: 15, twoStepConfirmation: false } })).toBe(true);
    }
  });
  it('rejects conflicting X rules', () => {
    expect(validSnapshot({ revision: 8, sites: [{ id: 'x', label: 'X / Twitter', hosts: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'],
      grayscale: false, entry: { mode: 'allow' }, rules: { 'x.hide-for-you': true, 'x.open-following': true } }] })).toBe(false);
  });
});

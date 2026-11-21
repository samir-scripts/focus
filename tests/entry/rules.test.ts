import { describe, expect, it } from 'vitest';
import { entryRules, passRule, documentKey, webTarget } from '../../apps/extension/src/entry-rules';

const origin = 'https://www.youtube.com/*';
const alias = 'https://youtu.be/*';
const matches = (rule: { condition: { regexFilter: string } }, url: string) => new RegExp(rule.condition.regexFilter).test(url);

describe('entry rules', () => {
  it('gates a granted exact host and scheme, never subdomains, sibling names or subresources', () => {
    const [rule] = entryRules(new Map([[origin, 'pause']]), 'chrome-extension://fixture/entry.html');
    expect(rule.condition.resourceTypes).toEqual(['main_frame']);
    expect(matches(rule, 'https://www.youtube.com/watch?id=73')).toBe(true);
    for (const url of ['http://www.youtube.com/', 'https://www.youtube.com.evil.test/', 'https://a.www.youtube.com/', 'https://youtu.be/']) {
      expect(matches(rule, url)).toBe(false);
    }
  });

  it('allows only the granted aliases or exact page in one tab, below Block priority', () => {
    const [pause, block] = entryRules(new Map([[origin, 'pause'], [alias, 'block']]), 'chrome-extension://fixture/entry.html');
    const visit = passRule(99, 12, [origin, alias]);
    const page = passRule(100, 12, [], 'https://www.youtube.com/watch?q=a+b.*#chapter');
    expect(visit.condition.tabIds).toEqual([12]);
    expect(matches(visit, 'https://youtu.be/safe')).toBe(true);
    expect(matches(visit, 'https://youtube.com/')).toBe(false);
    expect(matches(page, 'https://www.youtube.com/watch?q=a+b.*')).toBe(true);
    expect(matches(page, 'https://www.youtube.com/watch?q=abxx')).toBe(false);
    expect(matches(page, 'https://www.youtube.com/Watch?q=a+b.*')).toBe(false);
    expect(pause.priority).toBeLessThan(page.priority);
    expect(block.priority).toBeGreaterThan(visit.priority);
  });

  it('keeps the canonical destination, excludes anchors from page identity and rejects credentials', () => {
    expect(webTarget('https://www.youtube.com/watch?id=73#chapter')?.href).toBe('https://www.youtube.com/watch?id=73#chapter');
    expect(documentKey('https://www.youtube.com/watch?id=73#chapter')).toBe('https://www.youtube.com/watch?id=73');
    expect(webTarget('https://www.youtube.com@evil.test/')).toBeUndefined();
    expect(webTarget('javascript:alert(1)')).toBeUndefined();
    expect(webTarget('data:text/html,hello')).toBeUndefined();
  });
});

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface Subscription { url: string; name: string }
export interface ReadingSettings { enabled: boolean; page: string | null; feeds: Subscription[] }
export interface Headline { title: string; source: string; url: string }
export interface Preview { state: 'ready' | 'empty' | 'offline' | 'partial'; items: Headline[] }

export const readingSettingsRecovery = 'reading_settings_recovery';

export function webUrl(value: string) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

// Glance v0.8.8's page-content endpoint returns the server-rendered RSS list,
// already sorted and deduplicated by link. Never attach its markup to the DOM.
export function parsePreview(html: string): Preview {
  const template = document.createElement('template');
  template.innerHTML = html;
  const widget = template.content.querySelector('.widget-type-rss');
  if (!widget || widget.querySelector('.widget-error-header')) return { state: 'offline', items: [] };
  const items: Headline[] = [];
  const seen = new Set<string>();
  for (const anchor of widget.querySelectorAll('.widget-content > ul > li > a.title')) {
    const url = webUrl(anchor.getAttribute('href') ?? '');
    const title = anchor.textContent?.trim();
    const source = anchor.parentElement?.querySelector('.list-horizontal-text a')?.textContent?.trim();
    if (!url || !title || seen.has(url)) continue;
    seen.add(url);
    items.push({ url, title, source: source || new URL(url).hostname });
    if (items.length === 3) break;
  }
  return { items, state: widget.querySelector('.notice-icon') ? 'partial' : items.length ? 'ready' : 'empty' };
}

export const reading = {
  settings: () => invoke<ReadingSettings>('reading_settings'),
  save: (settings: ReadingSettings) => invoke<ReadingSettings>('save_reading_settings', { settings }),
  reset: () => invoke<ReadingSettings>('reset_reading_settings'),
  preview: async () => parsePreview(await invoke<string>('reading_preview')),
  open: (external = false) => invoke<void>('open_reading', { external }),
  article: (url: string) => invoke<void>('open_article', { url }),
  onConfirmed: (callback: () => void) => listen<string>('grace-start-confirmed', callback),
};
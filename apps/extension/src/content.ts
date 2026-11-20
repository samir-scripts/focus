import { startShortsFilter } from './sites/youtube';

declare const chrome: any;
const scope = globalThis as typeof globalThis & { __focusShorts?: { set: (enabled: boolean) => void } };
if (!scope.__focusShorts) {
  // Only registered or injected while this origin has an enabled cached policy.
  let stop: (() => void) | undefined = startShortsFilter(document);
  const set = (enabled: boolean) => {
    if (enabled && !stop) stop = startShortsFilter(document);
    if (!enabled && stop) { stop(); stop = undefined; }
  };
  scope.__focusShorts = { set };
  chrome.runtime.onMessage.addListener((message: { type?: string; enabled?: boolean }, _sender: unknown, respond: (value: object) => void) => {
    if (message?.type === 'focus-policy') { set(message.enabled === true); respond({ ok: true }); }
  });
  chrome.runtime.sendMessage({ type: 'focus-content-state' }, (response: { enabled?: boolean } | undefined) => {
    if (chrome.runtime.lastError) return;
    set(response?.enabled === true);
  });
}

import { startShortsFilter } from './sites/youtube';

declare const chrome: any;
const scope = globalThis as typeof globalThis & { __focusRules?: true };
if (!scope.__focusRules) {
  scope.__focusRules = true;
  let stop: (() => void) | undefined;
  let grayscale = false;
  const reflectGrayscale = () => {
    if (!document.documentElement) return;
    document.documentElement.toggleAttribute('data-focus-grayscale', grayscale);
    rootObserver?.disconnect();
  };
  const rootObserver = !document.documentElement ? new MutationObserver(reflectGrayscale) : undefined;
  rootObserver?.observe(document, { childList: true });
  const set = (policy?: { enabled?: boolean; grayscale?: boolean }) => {
    if (policy?.enabled && !stop) stop = startShortsFilter(document);
    if (!policy?.enabled && stop) { stop(); stop = undefined; }
    grayscale = policy?.grayscale === true;
    reflectGrayscale();
  };
  chrome.runtime.onMessage.addListener((message: { type?: string; enabled?: boolean; grayscale?: boolean }, _sender: unknown, respond: (value: object) => void) => {
    if (message?.type === 'focus-policy') { set(message); respond({ ok: true }); }
  });
  chrome.runtime.sendMessage({ type: 'focus-content-state' }, (response: { enabled?: boolean; grayscale?: boolean } | undefined) => {
    if (chrome.runtime.lastError) return;
    set(response);
  });
}

import { startShortsFilter, startHomeRecommendationsFilter } from './sites/youtube';
import { startXFilter, type XMode } from './sites/x';
import { startRedditFilter, type RedditMode } from './sites/reddit';
import type { FeedPolicy } from './sites/feed';

type ContentPolicy = FeedPolicy & { grayscale?: boolean };

declare const chrome: any;
const scope = globalThis as typeof globalThis & { __focusRules?: true };
if (!scope.__focusRules) {
  scope.__focusRules = true;
  let stop: (() => void) | undefined;
  let xMode: XMode | undefined;
  let stopX: (() => void) | undefined;
  let redditMode: RedditMode | undefined;
  let stopReddit: (() => void) | undefined;
  let stopYouTubeHome: (() => void) | undefined;
  let receivedPolicy = false;
  let grayscale = false;
  const reflectGrayscale = () => {
    if (!document.documentElement) return;
    document.documentElement.toggleAttribute('data-focus-grayscale', grayscale);
    rootObserver?.disconnect();
  };
  const rootObserver = !document.documentElement ? new MutationObserver(reflectGrayscale) : undefined;
  rootObserver?.observe(document, { childList: true });
  const set = (policy?: ContentPolicy) => {
    if (policy?.enabled && !stop) stop = startShortsFilter(document);
    if (!policy?.enabled && stop) { stop(); stop = undefined; }
    if (policy?.youtubeHome && !stopYouTubeHome) stopYouTubeHome = startHomeRecommendationsFilter(document);
    if (!policy?.youtubeHome && stopYouTubeHome) { stopYouTubeHome(); stopYouTubeHome = undefined; }
    if (xMode !== policy?.x) {
      stopX?.();
      xMode = policy?.x;
      stopX = xMode ? startXFilter(document, xMode) : undefined;
    }
    if (redditMode !== policy?.reddit) {
      stopReddit?.();
      redditMode = policy?.reddit;
      stopReddit = redditMode ? startRedditFilter(document, redditMode) : undefined;
    }
    grayscale = policy?.grayscale === true;
    reflectGrayscale();
  };
  chrome.runtime.onMessage.addListener((message: ContentPolicy & { type?: string }, _sender: unknown, respond: (value: object) => void) => {
    if (message?.type === 'focus-policy') { receivedPolicy = true; set(message); respond({ ok: true }); }
    if (message?.type === 'focus-route-change') document.dispatchEvent(new Event('focus-route-change'));
  });
  chrome.runtime.sendMessage({ type: 'focus-content-state' }, (response: ContentPolicy | undefined) => {
    if (chrome.runtime.lastError || receivedPolicy) return;
    set(response);
  });
}

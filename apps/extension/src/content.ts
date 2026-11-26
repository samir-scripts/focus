import { startShortsFilter, startHomeRecommendationsFilter } from './sites/youtube';
import { startXFilter, type XMode } from './sites/x';
import { startRedditFilter, type RedditMode } from './sites/reddit';
import { startInstagramFilter, trackInstagramDiscovery, type InstagramRules } from './sites/instagram';
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
  let instagram: InstagramRules | undefined;
  let stopInstagram: (() => void) | undefined;
  const instagramDiscovery = trackInstagramDiscovery(document);
  let receivedPolicy = false;
  let grayscale = false;
  const reflectGrayscale = () => {
    if (!document.documentElement) return;
    document.documentElement.toggleAttribute('data-focus-grayscale', grayscale);
    rootObserver?.disconnect();
  };
  const rootObserver = !document.documentElement ? new MutationObserver(reflectGrayscale) : undefined;
  rootObserver?.observe(document, { childList: true });
  const set = (policy?: ContentPolicy, initial = false) => {
    instagramDiscovery.applyPolicy(policy?.instagram?.reels === true, initial);
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
    if (instagram?.suggested !== policy?.instagram?.suggested || instagram?.reels !== policy?.instagram?.reels) {
      stopInstagram?.();
      instagram = policy?.instagram;
      stopInstagram = instagram ? startInstagramFilter(document, instagram, instagramDiscovery) : undefined;
    }
    grayscale = policy?.grayscale === true;
    reflectGrayscale();
  };
  chrome.runtime.onMessage.addListener((message: ContentPolicy & { type?: string }, _sender: unknown, respond: (value: object) => void) => {
    if (message?.type === 'focus-policy') {
      const initial = !receivedPolicy;
      receivedPolicy = true;
      set(message, initial);
      respond({ ok: true });
    }
    if (message?.type === 'focus-route-change') document.dispatchEvent(new Event('focus-route-change'));
  });
  chrome.runtime.sendMessage({ type: 'focus-content-state' }, (response: ContentPolicy | undefined) => {
    if (chrome.runtime.lastError || receivedPolicy) return;
    receivedPolicy = true;
    set(response, true);
  });
}

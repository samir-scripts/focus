import { mountTypewriter } from '../src/typewriter/viewer';

const art = document.querySelector<HTMLDivElement>('#art')!;
const canvas = art.querySelector('canvas')!;
const still = art.querySelector('img')!;
const controls = document.querySelector<HTMLDivElement>('#controls')!;
const unavailable = document.querySelector<HTMLParagraphElement>('#unavailable')!;
const reset = document.querySelector<HTMLButtonElement>('#reset')!;
const pause = document.querySelector<HTMLButtonElement>('#pause')!;
const status = document.querySelector('output')!;

const viewer = mountTypewriter(canvas, {
  onMode(mode) {
    art.hidden = mode === 'hidden';
    canvas.hidden = controls.hidden = mode !== 'live';
    still.hidden = mode === 'live' || mode === 'hidden';
    unavailable.hidden = mode !== 'static';
  },
  onPress(id, label) {
    status.dataset.key = id;
    status.replaceChildren(`${label} pressed.`);
  },
});
reset.addEventListener('click', viewer.reset);
pause.addEventListener('click', () => {
  const next = pause.getAttribute('aria-pressed') !== 'true';
  pause.setAttribute('aria-pressed', String(next));
  viewer.setPaused(next);
});
window.addEventListener('pagehide', event => { if (!event.persisted) viewer.destroy(); });
import.meta.hot?.dispose(viewer.destroy);

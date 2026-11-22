import type { WebGLRenderer } from 'three';
import { FloatClock } from './float';
import { keys } from './keyboard.json';
import { createRenderer, loadMachine, setView } from './scene';
import type { MachineScene } from './scene';

const byCode = new Map(keys.map(key => [key.code, key]));
const TURN = Math.PI / 180;
const PITCH_SPEED = .007;
const DRAG = 6;
const arrows: Record<string, [number, number]> = {
  ArrowLeft: [.13, 0], ArrowRight: [-.13, 0], ArrowUp: [0, .13], ArrowDown: [0, -.13],
};

type Mode = 'loading' | 'live' | 'static' | 'hidden';
interface ViewerOptions {
  paused?: boolean;
  onMode(mode: Mode): void;
  onPress?(id: string, label: string): void;
}
interface Gesture {
  pointer: number;
  x: number;
  y: number;
  yaw: number;
  pitch: number;
  cap: string | undefined;
  dragged: boolean;
}

/** Owns one canvas. Call destroy before removing it; remount with a new canvas. */
export function mountTypewriter(canvas: HTMLCanvasElement, options: ViewerOptions) {
  const events = new AbortController();
  const artwork = new AbortController();
  const eventOptions = { signal: events.signal };
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const contrast = matchMedia('(forced-colors: active)');
  const clock = new FloatClock();
  const held = new Set<string>();
  const pulses = new Map<string, number>();
  const blocked = () => !visible || document.hidden || contrast.matches;
  let mode: Mode | undefined;
  let machine: MachineScene | undefined;
  let renderer: WebGLRenderer | undefined;
  let attempted = false;
  let visible = false;
  let width = 0;
  let raf = 0;
  let yaw = 0;
  let pitch = 0;
  let gesture: Gesture | undefined;

  function announceMode(next: Mode) {
    if (mode === next) return;
    mode = next;
    options.onMode(next);
  }

  function paint(now: number) {
    if (!machine || !renderer || blocked() || width <= 0) return;
    machine.float(clock.offset(now), width);
    machine.draw(renderer);
  }

  function tick(now: number) {
    raf = 0;
    paint(now);
    schedule();
  }

  function schedule() {
    if (machine && renderer && !blocked() && width > 0 && clock.running) {
      if (!raf) raf = requestAnimationFrame(tick);
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function sync() {
    paint(performance.now());
    schedule();
  }

  function pause(reason: Parameters<FloatClock['set']>[0], value: boolean) {
    clock.set(reason, value, performance.now());
    schedule();
  }

  function rotate(nextYaw: number, nextPitch: number) {
    yaw = nextYaw % (2 * Math.PI);
    pitch = Math.max(-.17, Math.min(.54, nextPitch));
    if (machine) setView(machine.camera, yaw, pitch);
    sync();
  }

  function pick(x: number, y: number) {
    const b = canvas.getBoundingClientRect();
    if (!b.width || x < b.left || x >= b.right || y < b.top || y >= b.bottom) return;
    return machine?.pick(2 * (x - b.left) / b.width - 1, 1 - 2 * (y - b.top) / b.height);
  }

  function say(id: string) {
    const key = byCode.get(id);
    if (key) options.onPress?.(id, ({ ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', Space: 'Spacebar' } as Record<string, string>)[id] ?? key.legend);
  }

  function releasePulses() {
    for (const [id, timeout] of pulses) {
      clearTimeout(timeout);
      if (!held.has(id)) machine?.press(id, false);
    }
    pulses.clear();
  }

  function pulse(id: string) {
    clearTimeout(pulses.get(id));
    machine?.press(id, true);
    pulses.set(id, window.setTimeout(() => {
      pulses.delete(id);
      if (!held.has(id)) machine?.press(id, false);
      sync();
    }, 125));
    sync();
  }

  function releaseGesture() {
    const pointer = gesture?.pointer;
    gesture = undefined;
    if (pointer !== undefined && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
    delete canvas.dataset.dragging;
  }

  function releaseKeys() {
    for (const id of held) machine?.press(id, false);
    held.clear();
    releasePulses();
  }

  function clearInteraction() {
    releaseGesture();
    releaseKeys();
    delete canvas.dataset.overKey;
  }

  function dispose(releaseContext: boolean) {
    artwork.abort();
    clearInteraction();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    machine?.dispose();
    machine = undefined;
    renderer?.dispose();
    if (releaseContext) renderer?.forceContextLoss();
    renderer = undefined;
  }

  async function start() {
    attempted = true;
    try {
      renderer = createRenderer(canvas);
      const loaded = await loadMachine(artwork.signal);
      if (artwork.signal.aborted) {
        loaded.dispose();
        return;
      }
      machine = loaded;
      updateMode();
    } catch {
      if (artwork.signal.aborted) return;
      dispose(true);
      updateMode();
    }
  }

  function updateMode() {
    if (contrast.matches) {
      clearInteraction();
      announceMode('hidden');
    } else if (artwork.signal.aborted) {
      announceMode('static');
    } else if (machine) {
      announceMode('live');
      width = canvas.getBoundingClientRect().width;
    } else {
      announceMode('loading');
      if (!attempted) void start();
    }
    sync();
  }

  function endPointer(event: PointerEvent, cancelled: boolean) {
    if (gesture?.pointer !== event.pointerId) return;
    const { cap, dragged, x, y } = gesture;
    releaseGesture();
    if (!cancelled && !dragged && cap && Math.hypot(event.clientX - x, event.clientY - y) < DRAG) {
      pulse(cap);
      say(cap);
    }
  }

  canvas.addEventListener('pointerleave', () => {
    delete canvas.dataset.overKey;
  }, eventOptions);
  canvas.addEventListener('pointerdown', event => {
    if (!machine || gesture || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    // Raycast against the projection and cap poses already on screen.
    const cap = pick(event.clientX, event.clientY);
    releasePulses();
    canvas.setPointerCapture(event.pointerId);
    gesture = { pointer: event.pointerId, x: event.clientX, y: event.clientY, yaw, pitch, cap, dragged: false };
    sync();
  }, eventOptions);
  canvas.addEventListener('pointermove', event => {
    if (!gesture) {
      canvas.dataset.overKey = String(!!pick(event.clientX, event.clientY));
      return;
    }
    if (gesture.pointer !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.dragged && Math.hypot(dx, dy) < DRAG) return;
    gesture.dragged = true;
    canvas.dataset.dragging = 'true';
    rotate(gesture.yaw - dx * TURN, gesture.pitch + dy * PITCH_SPEED);
  }, eventOptions);
  canvas.addEventListener('pointerup', event => endPointer(event, false), eventOptions);
  canvas.addEventListener('pointercancel', event => endPointer(event, true), eventOptions);
  canvas.addEventListener('lostpointercapture', event => endPointer(event, true), eventOptions);

  canvas.addEventListener('blur', () => {
    releaseKeys();
    sync();
  }, eventOptions);
  canvas.addEventListener('keydown', event => {
    if (!machine || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    const delta = arrows[event.code];
    const key = byCode.get(event.code);
    if (!delta && !key && event.code !== 'Escape') return;
    event.preventDefault();
    if (event.code === 'Escape') reset();
    else if (delta) rotate(yaw + delta[0], pitch + delta[1]);
    else if (key && !held.has(key.id)) {
      held.add(key.id);
      machine.press(key.id, true);
      say(key.id);
      sync();
    }
  }, eventOptions);
  canvas.addEventListener('keyup', event => {
    const key = byCode.get(event.code);
    if (key && held.delete(key.id)) {
      event.preventDefault();
      pulse(key.id);
    }
  }, eventOptions);

  canvas.addEventListener('webglcontextlost', () => {
    if (artwork.signal.aborted) return;
    dispose(false);
    updateMode();
  }, eventOptions);
  motion.addEventListener('change', () => {
    pause('reduced', motion.matches);
    sync();
  }, eventOptions);
  contrast.addEventListener('change', updateMode, eventOptions);
  document.addEventListener('visibilitychange', () => {
    pause('hidden', document.hidden);
    if (document.hidden) clearInteraction();
    sync();
  }, eventOptions);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    pause('offscreen', !visible);
    if (!visible) clearInteraction();
    sync();
  });
  intersection.observe(canvas);
  const sizing = new ResizeObserver(([entry]) => {
    width = entry.contentRect.width;
    sync();
  });
  sizing.observe(canvas);
  pause('reduced', motion.matches);
  pause('hidden', document.hidden);
  pause('toner', options.paused ?? false);
  updateMode();

  function reset() {
    releaseGesture();
    releaseKeys();
    rotate(0, 0);
  }

  return {
    reset,
    setPaused(paused: boolean) { pause('toner', paused); sync(); },
    destroy() {
      events.abort();
      sizing.disconnect();
      intersection.disconnect();
      dispose(true);
    },
  };
}

import type { WebGLRenderer } from 'three';
import { COAST_DURATION, FlickSamples, RADIANS_PER_PIXEL, chaseResidual, coastTravel } from './flick';
import { FloatClock } from './float';
import { keys } from './keyboard.json';
import { createRenderer, loadMachine, setView } from './scene';
import type { MachineScene } from './scene';

const byCode = new Map(keys.map(key => [key.code, key]));
const DRAG = 6;
const SNAP = .14 * Math.PI / 180;
const MAX_LAG = 18 * Math.PI / 180;
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
  const flick = new FlickSamples();
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
  const chase = { yaw: 0, pitch: 0, sampled: 0 };
  let chasing = false;
  let coast: { yaw: number; pitch: number; unitYaw: number; unitPitch: number; speed: number; follow: number; started: number } | undefined;

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
    if (coast) {
      const elapsed = Math.max(0, now - coast.started);
      const remaining = elapsed >= COAST_DURATION ? 0 : chaseResidual(coast.follow, elapsed);
      const travel = coast.follow - remaining + coastTravel(coast.speed, elapsed);
      aim(coast.yaw + coast.unitYaw * travel, coast.pitch + coast.unitPitch * travel);
      if (elapsed >= COAST_DURATION) coast = undefined;
    } else if (chasing && now > chase.sampled) {
      const dyaw = chase.yaw - yaw, dpitch = chase.pitch - pitch;
      const distance = Math.hypot(dyaw, dpitch);
      const remaining = Math.min(MAX_LAG, chaseResidual(distance, now - chase.sampled));
      chase.sampled = now;
      if (remaining <= SNAP) {
        aim(chase.yaw, chase.pitch);
        chasing = false;
      } else {
        const step = 1 - remaining / distance;
        aim(yaw + dyaw * step, pitch + dpitch * step);
      }
    }
    paint(now);
    schedule();
  }

  function schedule() {
    if (machine && renderer && !blocked() && width > 0 && (clock.running || chasing || coast)) {
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

  function aim(nextYaw: number, nextPitch: number) {
    // Don't wrap the current angles away from an active drag target.
    yaw = nextYaw;
    pitch = nextPitch;
    if (machine) setView(machine.camera, yaw, pitch);
  }

  function rotate(nextYaw: number, nextPitch: number) {
    aim(nextYaw, nextPitch);
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
    coast = undefined;
    chasing = false;
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
    if (cancelled) {
      chasing = false;
      schedule();
      return;
    }
    if (dragged) {
      if (!motion.matches && !blocked()) {
        const velocity = flick.release(event.timeStamp);
        if (velocity) {
          const speed = Math.hypot(velocity.yaw, velocity.pitch);
          const unitYaw = velocity.yaw / speed, unitPitch = velocity.pitch / speed;
          // Continue from the displayed pose. Carry pending drag only in the
          // release direction, so a reversal cannot pull back on pointerup.
          const follow = chasing ? Math.min(MAX_LAG, Math.max(0, (chase.yaw - yaw) * unitYaw + (chase.pitch - pitch) * unitPitch)) : 0;
          chasing = false;
          coast = { yaw, pitch, unitYaw, unitPitch, speed, follow, started: performance.now() };
          schedule();
        }
      }
      return;
    }
    if (cap && Math.hypot(event.clientX - x, event.clientY - y) < DRAG) {
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
    coast = undefined;
    chasing = false;
    flick.start(event.clientX, event.clientY, event.timeStamp);
    // Raycast against the projection and cap poses already on screen.
    const cap = pick(event.clientX, event.clientY);
    releasePulses();
    canvas.setPointerCapture(event.pointerId);
    gesture = { pointer: event.pointerId, x: event.clientX, y: event.clientY,
      yaw: yaw % (2 * Math.PI), pitch: pitch % (2 * Math.PI), cap, dragged: false };
    yaw = gesture.yaw;
    pitch = gesture.pitch;
    sync();
  }, eventOptions);
  canvas.addEventListener('pointermove', event => {
    if (!gesture) {
      canvas.dataset.overKey = String(!!pick(event.clientX, event.clientY));
      return;
    }
    if (gesture.pointer !== event.pointerId) return;
    flick.move(event.clientX, event.clientY, event.timeStamp);
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.dragged && Math.hypot(dx, dy) < DRAG) return;
    gesture.dragged = true;
    canvas.dataset.dragging = 'true';
    const nextYaw = gesture.yaw - dx * RADIANS_PER_PIXEL;
    const nextPitch = gesture.pitch + dy * RADIANS_PER_PIXEL;
    if (motion.matches) rotate(nextYaw, nextPitch);
    else {
      chase.yaw = nextYaw;
      chase.pitch = nextPitch;
      if (!chasing) chase.sampled = performance.now();
      chasing = true;
      schedule();
    }
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
    coast = undefined;
    chasing = false;
    releaseGesture();
    schedule();
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
    if (motion.matches) {
      coast = undefined;
      chasing = false;
    }
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
    coast = undefined;
    chasing = false;
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

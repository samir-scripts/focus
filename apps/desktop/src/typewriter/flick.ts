export const RADIANS_PER_PIXEL = Math.PI / 480;
export const COAST_DURATION = 600;
const TIME_CONSTANT = 120;
const SAMPLE_WINDOW = 80;
const STALE = 70;
const CAPACITY = 32;
const MIN_SPEED = Math.PI / 4;
const MAX_SPEED = 4 * Math.PI / 3;

export class FlickSamples {
  private readonly x = new Float64Array(CAPACITY);
  private readonly y = new Float64Array(CAPACITY);
  private readonly time = new Float64Array(CAPACITY);
  private last = 0;
  private count = 0;

  start(x: number, y: number, time: number) {
    this.last = 0;
    this.count = 1;
    this.x[0] = x;
    this.y[0] = y;
    this.time[0] = time;
  }

  move(x: number, y: number, time: number) {
    const dx = x - this.x[this.last], dy = y - this.y[this.last];
    if (dx * dx + dy * dy < 4 || time <= this.time[this.last]) return;
    this.last = (this.last + 1) % CAPACITY;
    this.count = Math.min(this.count + 1, CAPACITY);
    this.x[this.last] = x;
    this.y[this.last] = y;
    this.time[this.last] = time;
  }

  release(up: number) {
    const end = this.last;
    if (this.count < 3 || up - this.time[end] >= STALE) return;
    const previous = (end + CAPACITY - 1) % CAPACITY;
    const dx = this.x[end] - this.x[previous], dy = this.y[end] - this.y[previous];
    const directionLength = Math.hypot(dx, dy);
    let start = end;
    // Follow only the latest sustained run, not displacement from before a reversal.
    for (let i = 1; i < this.count; i++) {
      const next = (end + CAPACITY - i) % CAPACITY;
      const x = this.x[start] - this.x[next], y = this.y[start] - this.y[next];
      if (up - this.time[next] > SAMPLE_WINDOW || x * dx + y * dy < .5 * directionLength * Math.hypot(x, y)) break;
      start = next;
    }
    if (start === end || start === previous) return;
    // Require momentum before the last sample so a single late spike cannot start a coast.
    const priorDistance = Math.hypot(this.x[previous] - this.x[start], this.y[previous] - this.y[start]);
    const priorSpeed = 1000 * RADIANS_PER_PIXEL * priorDistance / (this.time[previous] - this.time[start]);
    const x = this.x[end] - this.x[start], y = this.y[end] - this.y[start];
    const distance = Math.hypot(x, y);
    const speed = 1000 * RADIANS_PER_PIXEL * distance / (up - this.time[start]);
    if (priorDistance < 5 || priorSpeed < MIN_SPEED || speed < MIN_SPEED) return;
    const scale = Math.min(MAX_SPEED, speed, 1.5 * priorSpeed) / distance;
    return { yaw: -x * scale, pitch: y * scale };
  }
}

/** Integrate angular velocity over elapsed milliseconds, independent of frame cadence. */
export function coastTravel(radiansPerSecond: number, elapsed: number) {
  return radiansPerSecond * TIME_CONSTANT / 1000 * -Math.expm1(-Math.max(0, Math.min(elapsed, COAST_DURATION)) / TIME_CONSTANT);
}

/** Residual angular distance after chasing a fixed target for elapsed milliseconds. */
export function chaseResidual(distance: number, elapsed: number) {
  const softLimit = 8 * Math.PI / 180;
  if (distance > softLimit) {
    // Large jumps close quickly, but remain continuous rather than snapping to the lag limit.
    const fastTime = 17 * Math.log(distance / softLimit);
    if (elapsed < fastTime) return distance * Math.exp(-elapsed / 17);
    return softLimit * Math.exp(-(elapsed - fastTime) / 55);
  }
  return distance * Math.exp(-elapsed / 55);
}

export const YAW_PER_PIXEL = Math.PI / 360;
export const COAST_DURATION = 600;
const TIME_CONSTANT = 150;
const SAMPLE_WINDOW = 80;
const STALE = 70;
const CAPACITY = 32;

export class FlickSamples {
  private readonly x = new Float64Array(CAPACITY);
  private readonly time = new Float64Array(CAPACITY);
  private last = 0;
  private count = 0;

  start(x: number, time: number) {
    this.last = 0;
    this.count = 1;
    this.x[0] = x;
    this.time[0] = time;
  }

  move(x: number, time: number) {
    if (Math.abs(x - this.x[this.last]) < 2 || time <= this.time[this.last]) return;
    this.last = (this.last + 1) % CAPACITY;
    this.count = Math.min(this.count + 1, CAPACITY);
    this.x[this.last] = x;
    this.time[this.last] = time;
  }

  release(up: number) {
    const end = this.last;
    if (this.count < 3 || up - this.time[end] >= STALE) return 0;
    const previous = (end + CAPACITY - 1) % CAPACITY;
    const direction = Math.sign(this.x[end] - this.x[previous]);
    let start = end;
    // Follow only the latest sustained run, not displacement from before a reversal.
    for (let i = 1; i < this.count; i++) {
      const next = (end + CAPACITY - i) % CAPACITY;
      if (up - this.time[next] > SAMPLE_WINDOW || Math.sign(this.x[start] - this.x[next]) !== direction) break;
      start = next;
    }
    if (start === end || start === previous) return 0;
    // Require momentum before the last sample so a single late spike cannot start a coast.
    const priorDistance = Math.abs(this.x[previous] - this.x[start]);
    const priorSpeed = 500 * priorDistance / (this.time[previous] - this.time[start]);
    const speed = 500 * Math.abs(this.x[end] - this.x[start]) / (up - this.time[start]);
    if (priorDistance < 5 || priorSpeed < 45 || speed < 45) return 0;
    return -direction * Math.min(300, speed, 1.5 * priorSpeed) * Math.PI / 180;
  }
}

/** Integrate angular velocity over elapsed milliseconds, independent of frame cadence. */
export function coastTravel(radiansPerSecond: number, elapsed: number) {
  return radiansPerSecond * TIME_CONSTANT / 1000 * -Math.expm1(-Math.max(0, Math.min(elapsed, COAST_DURATION)) / TIME_CONSTANT);
}

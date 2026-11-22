type PauseReason = 'hidden' | 'offscreen' | 'reduced' | 'toner';

/** Freeze the last displayed sample, not the position of a future frame. */
export class FloatClock {
  private readonly pauses = new Set<PauseReason>(['offscreen']);
  private elapsed = 0;
  private from = 0;
  private shown = 0;

  get running() { return this.pauses.size === 0; }

  set(reason: PauseReason, paused: boolean, now: number) {
    const running = this.running;
    if (paused) this.pauses.add(reason);
    else this.pauses.delete(reason);
    if (this.pauses.has('reduced')) this.elapsed = this.shown = 0;
    if (!running && this.running) this.from = now - this.elapsed;
  }

  offset(now: number) {
    if (this.running) {
      this.elapsed = Math.max(0, now - this.from) % 6000;
      this.shown = 6 * Math.sin(this.elapsed * Math.PI / 3000);
    }
    return this.shown;
  }
}

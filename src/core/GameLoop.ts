export class GameLoop {
  private readonly fixedDelta = 1 / 60; // 0.016667s
  private accumulator = 0;
  private lastTime = 0;
  private running = false;
  private animFrameId = 0;
  private hitstopDuration = 0;

  constructor(
    private updateFn: (dt: number) => void,
    private renderFn: (alpha: number) => void
  ) {}

  public triggerHitstop(durationMs: number): void {
    this.hitstopDuration = Math.max(this.hitstopDuration, durationMs / 1000);
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.animFrameId = requestAnimationFrame(this.onFrame);
  }

  private onFrame = (now: number): void => {
    if (!this.running) return;
    let deltaSec = (now - this.lastTime) / 1000;
    this.lastTime = now;

    if (deltaSec > 0.12) deltaSec = 0.12;

    if (this.hitstopDuration > 0) {
      this.hitstopDuration -= deltaSec;
      // 頓幀期間只繪製不推進物理
      this.renderFn(1.0);
      this.animFrameId = requestAnimationFrame(this.onFrame);
      return;
    }

    this.accumulator += deltaSec;
    while (this.accumulator >= this.fixedDelta) {
      this.updateFn(this.fixedDelta);
      this.accumulator -= this.fixedDelta;
    }

    const alpha = this.accumulator / this.fixedDelta;
    this.renderFn(alpha);

    this.animFrameId = requestAnimationFrame(this.onFrame);
  };

  public stop(): void {
    this.running = false;
    cancelAnimationFrame(this.animFrameId);
  }
}

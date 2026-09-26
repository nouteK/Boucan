/** Token bucket: `burst` tokens max, refilled at `perSecond`. Time is passed in, never read. */
export class RateLimiter {
  private tokens: number;
  private last: number;

  constructor(
    private readonly burst: number,
    private readonly perSecond: number,
    now: number,
  ) {
    this.tokens = burst;
    this.last = now;
  }

  take(now: number, cost = 1): boolean {
    const elapsed = Math.max(0, now - this.last);
    this.last = now;
    this.tokens = Math.min(this.burst, this.tokens + (elapsed * this.perSecond) / 1000);
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}

/** Counts events in a sliding window (used for protocol-error tolerance). */
export class WindowCounter {
  private hits: number[] = [];

  constructor(private readonly windowMs: number) {}

  hit(now: number): number {
    this.hits = this.hits.filter((t) => now - t < this.windowMs);
    this.hits.push(now);
    return this.hits.length;
  }
}

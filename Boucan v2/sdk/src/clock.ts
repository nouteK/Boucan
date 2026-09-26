/**
 * Server clock estimation (NTP-like). Each sample: send t0, receive
 * serverTime, measure the round trip; offset = serverTime − (t0 + rtt/2).
 * The sample with the lowest RTT is the most accurate, so we keep the best
 * of the recent ones.
 */
export interface ClockSample {
  offset: number;
  rtt: number;
}

export class ServerClock {
  private samples: ClockSample[] = [];
  private best: ClockSample | null = null;

  constructor(private readonly keep = 8) {}

  add(t0: number, serverTime: number, t1: number): ClockSample {
    const rtt = Math.max(0, t1 - t0);
    const sample = { offset: serverTime - (t0 + rtt / 2), rtt };
    this.samples.push(sample);
    if (this.samples.length > this.keep) this.samples.shift();
    this.best = this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    return sample;
  }

  get synced(): boolean {
    return this.best !== null;
  }

  /** Milliseconds to add to the local clock to get server time. */
  get offset(): number {
    return this.best?.offset ?? 0;
  }

  get rtt(): number | null {
    return this.best?.rtt ?? null;
  }

  /** Current server time estimate (epoch ms). */
  now(): number {
    return Date.now() + this.offset;
  }
}

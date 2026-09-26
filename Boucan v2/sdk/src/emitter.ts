// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyListener = (...args: any[]) => void;

/** Minimal typed event emitter (no dependency, works everywhere). */
export class Emitter<Events extends Record<string, unknown[]>> {
  private readonly listeners = new Map<keyof Events, Set<AnyListener>>();

  /** Subscribes; returns the unsubscribe function. */
  on<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(listener);
    return () => this.off(event, listener);
  }

  once<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): () => void {
    const off = this.on(event, (...args) => {
      off();
      listener(...args);
    });
    return off;
  }

  off<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  protected emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      try {
        listener(...args);
      } catch (error) {
        // A UI listener bug must never break the network layer.
        console.error(`[boucan-sdk] listener for "${String(event)}" threw`, error);
      }
    }
  }
}

export type AudioBufferLoader<T> = () => Promise<T>;

/**
 * Runtime-only cache for decoded audio resources.
 *
 * The cache stores successful values and shares an in-flight load for the same
 * key. Rejected loads are removed so a later request can retry. Values are
 * evicted oldest-first once the configured entry limit is exceeded.
 */
export class AudioBufferCache<T> {
  private readonly values = new Map<string, T>();
  private readonly pending = new Map<string, Promise<T>>();
  private readonly maxEntries: number;

  public constructor(maxEntries = 32) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
      throw new Error('Audio buffer cache size must be a positive integer');
    }
    this.maxEntries = maxEntries;
  }

  public get(key: string): T | undefined {
    return this.values.get(key);
  }

  public has(key: string): boolean {
    return this.values.has(key);
  }

  public get size(): number {
    return this.values.size;
  }

  public set(key: string, value: T): void {
    this.values.delete(key);
    this.values.set(key, value);
    while (this.values.size > this.maxEntries) {
      const oldestKey = this.values.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      this.values.delete(oldestKey);
    }
  }

  public delete(key: string): boolean {
    return this.values.delete(key);
  }

  public clear(): void {
    this.values.clear();
  }

  public load(key: string, loader: AudioBufferLoader<T>): Promise<T> {
    const cached = this.values.get(key);
    if (cached !== undefined) return Promise.resolve(cached);

    const existing = this.pending.get(key);
    if (existing) return existing;

    const pending = Promise.resolve()
      .then(loader)
      .then((value) => {
        this.set(key, value);
        return value;
      })
      .finally(() => {
        if (this.pending.get(key) === pending) this.pending.delete(key);
      });

    this.pending.set(key, pending);
    return pending;
  }
}

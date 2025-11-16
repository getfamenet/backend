type Entry<T> = { value: T; expiry: number };
export class TTLCache<T> {
  private store = new Map<string, Entry<T>>();
  constructor(private ttlMs: number) {}
  get(key: string): T | undefined {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expiry) {
      this.store.delete(key);
      return undefined;
    }
    return e.value;
  }
  set(key: string, value: T) {
    this.store.set(key, { value, expiry: Date.now() + this.ttlMs });
  }
  clear() { this.store.clear(); }
}

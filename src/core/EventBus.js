export class EventBus {
  constructor() {
    this._listeners = new Map();
    this._persistent = new Map();
  }
  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(fn);
    return () => this.off(event, fn);
  }
  onPersistent(event, fn) {
    if (!this._persistent.has(event)) this._persistent.set(event, new Set());
    this._persistent.get(event).add(fn);
    return () => this._persistent.get(event)?.delete(fn);
  }
  off(event, fn) {
    this._listeners.get(event)?.delete(fn);
    this._persistent.get(event)?.delete(fn);
  }
  emit(event, payload) {
    this._persistent.get(event)?.forEach(fn => fn(payload));
    this._listeners.get(event)?.forEach(fn => fn(payload));
  }
  clear(event = null) {
    if (event) this._listeners.delete(event);
    else this._listeners.clear();
  }
  listenerCount(event = null) {
    if (event) return (this._listeners.get(event)?.size ?? 0) + (this._persistent.get(event)?.size ?? 0);
    let count = 0;
    for (const set of this._listeners.values()) count += set.size;
    for (const set of this._persistent.values()) count += set.size;
    return count;
  }
}
export const bus = new EventBus();

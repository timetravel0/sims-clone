/**
 * Pub/Sub event bus per decoupling tra moduli.
 */
export class EventBus {
  constructor() {
    this.listeners = new Map();
  }
  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(callback);
  }
  off(event, callback) {
    const set = this.listeners.get(event);
    if (set) set.delete(callback);
  }
  emit(event, data) {
    const set = this.listeners.get(event);
    if (set) set.forEach(cb => cb(data));
  }
}

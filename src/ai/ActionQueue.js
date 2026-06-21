import { bus } from '../core/EventBus.js';

/**
 * ActionQueue — FIFO sequence of Actions with enter/update/exit lifecycle.
 * override() clears the queue and replaces it with new actions.
 * Accepts single Action or Action[].
 */
export class ActionQueue {
  constructor() { this._queue = []; this._current = null; }

  push(...actions) {
    const flat = actions.flat();
    for (const a of flat) this._queue.push(a);
  }

  clear() {
    if (this._current) { this._current.exit?.(); this._current = null; }
    for (const action of this._queue) action.exit?.();
    this._queue = [];
  }

  update(dt) {
    if (!this._current && this._queue.length > 0) {
      this._current = this._queue.shift();
      this._current.enter?.();
      if (this._current._sim) {
        bus.emit('sim:action', { simId: this._current._sim.id, label: this._current.label });
      }
    }
    if (!this._current) return;
    this._current.update(dt);
    if (this._current.done) {
      const simId = this._current._sim?.id;
      this._current.exit?.();
      this._current = null;
      if (simId && this._queue.length === 0) bus.emit('sim:action', { simId, label: '' });
    }
  }

  isEmpty() { return !this._current && this._queue.length === 0; }
}

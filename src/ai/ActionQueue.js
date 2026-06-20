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
    this._queue = [];
  }

  update(dt) {
    if (!this._current && this._queue.length > 0) {
      this._current = this._queue.shift();
      this._current.enter?.();
    }
    if (!this._current) return;
    this._current.update(dt);
    if (this._current.done) {
      this._current.exit?.();
      this._current = null;
    }
  }

  isEmpty() { return !this._current && this._queue.length === 0; }
}

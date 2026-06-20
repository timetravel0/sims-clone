/**
 * FIFO queue of Actions with enter/update/exit lifecycle.
 */
export class ActionQueue {
  constructor() {
    this._queue = [];
    this._current = null;
  }

  push(...actions) {
    for (const a of actions) this._queue.push(a);
  }

  clear() {
    if (this._current) { this._current.exit(); this._current = null; }
    this._queue = [];
  }

  isEmpty() {
    return !this._current && this._queue.length === 0;
  }

  update(dt) {
    if (!this._current && this._queue.length > 0) {
      this._current = this._queue.shift();
      this._current.enter();
    }
    if (!this._current) return;
    this._current.update(dt);
    if (this._current.done) {
      this._current.exit();
      this._current = null;
    }
  }
}

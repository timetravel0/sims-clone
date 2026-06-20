const UPDATE_RATE = 20;
const TICK_MS = 1000 / UPDATE_RATE;

export class GameLoop {
  constructor({ onUpdate, onRender }) {
    this._onUpdate = onUpdate;
    this._onRender = onRender;
    this._running = false;
    this._paused = false;
    this._speed = 1;
    this._accumulator = 0;
    this._lastTime = 0;
    this._rafId = null;
  }

  start() {
    this._running = true;
    this._lastTime = performance.now();
    this._rafId = requestAnimationFrame(this._tick.bind(this));
  }

  stop() {
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
  }

  togglePause() {
    this._paused = !this._paused;
    if (!this._paused) this._lastTime = performance.now();
    return this._paused;
  }

  get paused() { return this._paused; }
  setSpeed(s) { this._speed = Math.max(0.1, s); }

  _tick(now) {
    if (!this._running) return;
    this._rafId = requestAnimationFrame(this._tick.bind(this));
    const wall = now - this._lastTime;
    this._lastTime = now;
    if (!this._paused) {
      this._accumulator += wall * this._speed;
      while (this._accumulator >= TICK_MS) {
        this._onUpdate(TICK_MS / 1000);
        this._accumulator -= TICK_MS;
      }
    }
    this._onRender();
  }
}

/**
 * Game loop con fixed timestep (60 UPS) e interpolazione del renderer.
 */
export class GameLoop {
  constructor(update, render) {
    this.update = update;
    this.render = render;
    this.lastTime = 0;
    this.accumulator = 0;
    this.step = 1 / 60;
    this.running = false;
    this.timeScale = 1;
  }
  start() {
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(t => this.loop(t));
  }
  loop(time) {
    if (!this.running) return;
    const dt = Math.min((time - this.lastTime) / 1000, 0.25);
    this.lastTime = time;
    this.accumulator += dt * this.timeScale;
    while (this.accumulator >= this.step) {
      this.update(this.step);
      this.accumulator -= this.step;
    }
    this.render();
    requestAnimationFrame(t => this.loop(t));
  }
}

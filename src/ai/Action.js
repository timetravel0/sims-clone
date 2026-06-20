import { Pathfinder } from './Pathfinder.js';
import { Logger } from '../utils/Logger.js';

export class Action {
  constructor(label) { this.label = label; this.done = false; }
  enter() {} update(_dt) { this.done = true; } exit() {}
}

export class WalkToAction extends Action {
  constructor(sim, world, gx, gz) {
    super(`WalkTo(${gx},${gz})`);
    this._sim = sim; this._world = world; this._gx = gx; this._gz = gz;
  }
  enter() {
    const pf   = new Pathfinder(this._world.tilemap);
    const path = pf.find(this._sim.gx, this._sim.gz, this._gx, this._gz);
    if (path && path.length > 0) {
      // Open any doors in path
      this._world.doorManager?.resolvePath(path);
      this._sim.startPath(path);
    } else {
      Logger.warn(`[WalkTo] No path to (${this._gx},${this._gz})`);
      this.done = true;
    }
  }
  update(_dt) { if (!this._sim.isMoving) this.done = true; }
}

export class UseObjectAction extends Action {
  constructor(sim, furniture, duration = 5) {
    super(`UseObject(${furniture.id})`);
    this._sim = sim; this._furniture = furniture;
    this._duration = duration; this._elapsed = 0;
  }
  enter() { this._furniture.inUse = true; }
  update(dt) {
    this._elapsed += dt;
    this._sim.needs.restore(this._furniture.needTarget, this._furniture.restoreRate * dt);
    this._furniture.onUseTick?.(this._sim, dt); // custom hook
    if (this._elapsed >= this._duration) this.done = true;
  }
  exit() { this._furniture.inUse = false; }
}

export class IdleAction extends Action {
  constructor(_sim, duration = 2) { super('Idle'); this._duration = duration; this._elapsed = 0; }
  update(dt) { this._elapsed += dt; if (this._elapsed >= this._duration) this.done = true; }
}

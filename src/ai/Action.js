import { Pathfinder } from './Pathfinder.js';
import { Logger } from '../utils/Logger.js';

/** Base class for all actions */
export class Action {
  constructor(label) {
    this.label = label;
    this.done = false;
  }
  enter() {}
  update(_dt) { this.done = true; }
  exit() {}
}

/** Walk the Sim to a grid cell */
export class WalkToAction extends Action {
  constructor(sim, world, gx, gz) {
    super(`WalkTo(${gx},${gz})`);
    this._sim = sim;
    this._world = world;
    this._gx = gx;
    this._gz = gz;
    this._arrived = false;
  }

  enter() {
    const pf = new Pathfinder(this._world.tilemap);
    const path = pf.find(this._sim.gx, this._sim.gz, this._gx, this._gz);
    if (path && path.length > 0) {
      this._sim.startPath(path);
      Logger.info(`[WalkTo] Path found (${path.length} steps)`);
    } else {
      Logger.warn(`[WalkTo] No path to (${this._gx},${this._gz})`);
      this.done = true;
    }
  }

  update(_dt) {
    if (!this._sim.isMoving) this.done = true;
  }
}

/** Use a furniture item (restores a need over time) */
export class UseObjectAction extends Action {
  constructor(sim, furniture, duration = 5) {
    super(`UseObject(${furniture.id})`);
    this._sim = sim;
    this._furniture = furniture;
    this._duration = duration;
    this._elapsed = 0;
  }

  enter() {
    this._furniture.inUse = true;
    Logger.info(`[UseObject] ${this._sim.name} is using ${this._furniture.id}`);
  }

  update(dt) {
    this._elapsed += dt;
    this._sim.needs.restore(this._furniture.needTarget, this._furniture.restoreRate * dt);
    if (this._elapsed >= this._duration) this.done = true;
  }

  exit() {
    this._furniture.inUse = false;
  }
}

/** Idle for a given duration */
export class IdleAction extends Action {
  constructor(sim, duration = 2) {
    super('Idle');
    this._duration = duration;
    this._elapsed = 0;
  }
  update(dt) {
    this._elapsed += dt;
    if (this._elapsed >= this._duration) this.done = true;
  }
}

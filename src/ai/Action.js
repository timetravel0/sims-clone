import { Pathfinder } from './Pathfinder.js';
import { Logger }    from '../utils/Logger.js';
import { bus }       from '../core/EventBus.js';

export class Action {
  constructor(label) { this.label = label; this.done = false; }
  enter()       {}
  update(_dt)   { this.done = true; }
  exit()        {}
}

export class WalkToAction extends Action {
  constructor(sim, world, gx, gz) {
    super(`WalkTo(${gx},${gz})`);
    this._sim = sim; this._world = world; this._gx = gx; this._gz = gz;
  }
  enter() {
    const target = this._world.findNearestAvailableCell(this._gx, this._gz, this._sim);
    if (!target) {
      Logger.warn(`[WalkTo] No free destination near (${this._gx},${this._gz})`);
      this.done = true;
      return;
    }
    this._gx = target.x;
    this._gz = target.z;
    this.label = `WalkTo(${this._gx},${this._gz})`;
    const pf = new Pathfinder(this._world.tilemap, (x, z) =>
      this._world.isCellOccupied(x, z, this._sim.id) ||
      this._world.isCellReserved(x, z, this._sim.id),
      (x1, z1, x2, z2) => this._world.wallManager?.isPassable(x1, z1, x2, z2) ?? true
    );
    const path = pf.find(this._sim.gx, this._sim.gz, this._gx, this._gz);
    if (path && path.length > 0) {
      if (!this._world.reserveCell(this._gx, this._gz, this._sim)) {
        Logger.warn(`[WalkTo] Destination became unavailable (${this._gx},${this._gz})`);
        this.done = true;
        return;
      }
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
  constructor(sim, furniture, duration = 5, affordance = null) {
    super(affordance?.label ? `${affordance.label}(${furniture.id})` : `UseObject(${furniture.id})`);
    this._sim = sim; this._furniture = furniture;
    this._duration = duration; this._elapsed = 0;
    this._affordance = affordance;
    this._using = false;
  }
  enter() {
    if (this._furniture.inUse || (this._furniture.reservedBy && this._furniture.reservedBy !== this._sim.id)) {
      Logger.warn(`[UseObject] ${this._furniture.id} is already in use`);
      this.done = true;
      return;
    }
    const dx = this._sim.gx - this._furniture.gx;
    const dz = this._sim.gz - this._furniture.gz;
    if (Math.abs(dx) + Math.abs(dz) > 1) {
      Logger.warn(`[UseObject] ${this._sim.name} is not adjacent to ${this._furniture.id}`);
      if (this._furniture.reservedBy === this._sim.id) this._furniture.reservedBy = null;
      this.done = true;
      return;
    }
    this._furniture.reservedBy = this._sim.id;
    this._furniture.inUse = true;
    this._using = true;
  }
  update(dt) {
    this._elapsed += dt;
    if (this._affordance?.utility) {
      for (const [need, amount] of Object.entries(this._affordance.utility)) {
        const tickAmount = (amount / Math.max(0.1, this._duration)) * dt;
        if (tickAmount >= 0) this._sim.needs.restore(need, tickAmount);
        else this._sim.needs.decay(need, Math.abs(tickAmount));
      }
    } else {
      this._sim.needs.restore(this._furniture.needTarget, this._furniture.restoreRate * dt);
    }
    this._furniture.onUseTick?.(this._sim, dt);
    if (this._elapsed >= this._duration) {
      bus.emit('sim:objectUsed', {
        sim: this._sim,
        simId: this._sim.id,
        furniture: this._furniture,
        objectType: this._furniture.id,
      });
      this.done = true;
    }
  }
  exit() {
    if (this._using) this._furniture.inUse = false;
    if (this._furniture.reservedBy === this._sim.id) this._furniture.reservedBy = null;
    this._using = false;
  }
}

export class IdleAction extends Action {
  constructor(sim, duration = 2) {
    super('Idle'); this._sim = sim; this._duration = duration; this._elapsed = 0;
  }
  update(dt) {
    this._elapsed += dt;
    if (this._elapsed >= this._duration) this.done = true;
  }
}

// Register globally for ContextMenu lazy access.
if (typeof window !== 'undefined') {
  window._actionClasses = { WalkToAction, UseObjectAction, IdleAction };
}

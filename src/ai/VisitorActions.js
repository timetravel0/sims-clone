import { Action, WalkToAction, IdleAction } from './Action.js';
import { SocialAction } from './SocialAction.js';

function point(entryPoint, preferred = 'porch') {
  if (preferred === 'door') {
    return { gx: entryPoint?.doorGx ?? entryPoint?.gx, gz: entryPoint?.doorGz ?? entryPoint?.gz };
  }
  if (preferred === 'inside') {
    return { gx: entryPoint?.insideGx ?? entryPoint?.gx, gz: entryPoint?.insideGz ?? entryPoint?.gz };
  }
  return {
    gx: entryPoint?.porchGx ?? entryPoint?.spawnGx ?? entryPoint?.gx,
    gz: entryPoint?.porchGz ?? entryPoint?.spawnGz ?? entryPoint?.gz,
  };
}

export class WalkToDoorAction extends WalkToAction {
  constructor(sim, world, entryPoint) {
    const p = point(entryPoint, 'porch');
    super(sim, world, p.gx ?? sim.gx, p.gz ?? sim.gz);
    this.label = 'WalkToDoor';
  }
}

export class RingDoorbellAction extends Action {
  constructor(sim, visit) {
    super('RingDoorbell');
    this._sim = sim;
    this._visit = visit;
    this._elapsed = 0;
  }
  enter() {
    this._sim.showBubble('Ding dong', 2);
  }
  update(dt) {
    this._elapsed += dt;
    if (this._elapsed >= 1.2) this.done = true;
  }
}

export class WaitForInviteAction extends IdleAction {
  constructor(sim, duration = 3) {
    super(sim, duration);
    this.label = 'WaitForInvite';
  }
}

export class EnterHouseAction extends WalkToAction {
  constructor(sim, world, entryPoint) {
    const p = point(entryPoint, 'inside');
    super(sim, world, p.gx ?? sim.gx, p.gz ?? sim.gz);
    this.label = 'EnterHouse';
  }
}

export class VisitSocializeAction extends SocialAction {
  constructor(visitor, host, world, type = 'chat') {
    super(visitor, host, world, type, {
      label: `Visit ${type}`,
      duration: 4,
      utility: { social: 12, fun: 4, energy: -3 },
    });
    this.label = 'VisitSocialize';
  }
}

export class LeaveHouseAction extends WalkToAction {
  constructor(sim, world, entryPoint) {
    const p = point(entryPoint, 'porch');
    super(sim, world, p.gx ?? sim.gx, p.gz ?? sim.gz);
    this.label = 'LeaveHouse';
  }
}

export class ReturnHomeAction extends IdleAction {
  constructor(sim, _world, _entryPoint) {
    // The map has no physical outside area yet; after reaching the porch, the
    // VisitorSystem deactivates the Sim and returns the person to off-lot state.
    super(sim, 0.4);
    this.label = 'ReturnHome';
  }
}

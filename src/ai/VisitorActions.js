import { Action, WalkToAction, IdleAction } from './Action.js';
import { SocialAction } from './SocialAction.js';

export class WalkToDoorAction extends WalkToAction {
  constructor(sim, world, entryPoint) {
    super(sim, world, entryPoint?.doorGx ?? entryPoint?.gx ?? sim.gx, entryPoint?.doorGz ?? entryPoint?.gz ?? sim.gz);
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
    const gx = entryPoint?.insideGx ?? entryPoint?.doorGx ?? sim.gx;
    const gz = entryPoint?.insideGz ?? ((entryPoint?.doorGz ?? sim.gz) + 1);
    super(sim, world, gx, gz);
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
    super(sim, world, entryPoint?.doorGx ?? entryPoint?.gx ?? sim.gx, entryPoint?.doorGz ?? entryPoint?.gz ?? sim.gz);
    this.label = 'LeaveHouse';
  }
}

export class ReturnHomeAction extends WalkToAction {
  constructor(sim, world, entryPoint) {
    super(sim, world, entryPoint?.gx ?? sim.gx, entryPoint?.gz ?? sim.gz);
    this.label = 'ReturnHome';
  }
}

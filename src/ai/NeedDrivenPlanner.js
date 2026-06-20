import { WalkToAction, UseObjectAction } from './Action.js';
import { Logger } from '../utils/Logger.js';

const NEED_EMOJI = {
  hunger: '🍔 Hungry', energy: '😴 Sleepy', bladder: '🚽 Need WC',
  hygiene: '🚿 Dirty', social: '👋 Lonely', fun: '🎮 Bored',
  comfort: '🛋️ Tired', room: '🌿 Stuffy',
};

export class NeedDrivenPlanner {
  constructor(sim) { this._sim = sim; this.lastNeedLabel = ''; }

  plan() {
    const need = this._sim.needs.mostCritical(35);
    if (!need) return [];
    const furniture = this._sim._world.getFurnitureFor(need);
    if (!furniture) { Logger.warn(`[Planner] No furniture for: ${need}`); return []; }
    this.lastNeedLabel = NEED_EMOJI[need] || need;
    Logger.info(`[Planner] "${need}" critical → ${furniture.id}`);
    return [
      new WalkToAction(this._sim, this._sim._world, furniture.gx, furniture.gz + 1),
      new UseObjectAction(this._sim, furniture, 6),
    ];
  }
}

import { bus } from '../core/EventBus.js';
const TARGET_SCORE = 60, TARGET_DAYS = 3;

export class HouseholdGoalSystem {
  constructor(game) {
    this._game = game;
    this._days = 0;
    this._status = 'active';
    this._resetAtDay = null;
    bus.on('clock:dayChanged', () => this._tick());
  }

  get progress() { return { days: this._days, target: TARGET_DAYS, score: TARGET_SCORE, status: this._status }; }

  _tick() {
    if (this._status === 'completed' && (this._game.clock?.day ?? 0) >= this._resetAtDay) {
      this._days = 0; this._status = 'active'; this._resetAtDay = null;
    }
    if (this._status !== 'active') return;
    const sims = (this._game.sims ?? []).filter(s => !s._isVisitor && !s._atWork);
    if (!sims.length) return;
    const allHappy = sims.every(s => {
      const v = Object.values(s.needs?.getAll?.() ?? {});
      return v.length && v.reduce((a, b) => a + b, 0) / v.length >= TARGET_SCORE;
    });
    this._days = allHappy ? this._days + 1 : 0;
    if (this._days >= TARGET_DAYS) this._complete();
    bus.emit('household:goalProgress', this.progress);
  }

  _complete() {
    this._status = 'completed';
    this._resetAtDay = (this._game.clock?.day ?? 0) + 7;
    this._game.budgetSystem?.credit?.(500, 'household_goal_bonus');
    bus.emit('household:goalCompleted', this.progress);
    bus.emit('story:entry', { text: 'La famiglia ha raggiunto il benessere condiviso! +§500', cat: 'family' });
  }

  serialise() { return { days: this._days, status: this._status, resetAtDay: this._resetAtDay }; }
  restore(d = {}) { this._days = d.days ?? 0; this._status = d.status ?? 'active'; this._resetAtDay = d.resetAtDay ?? null; }
}

/**
 * AgeSystem
 * ---------
 * Tracks each Sim's age in simulated days and fires life-stage
 * transitions via EventBus.
 *
 * Emits:
 *   lifecycle:stageChanged  { sim, oldStage, newStage, age }
 *   story:entry             { text, category: 'positive' }
 */

import { bus } from '../core/EventBus.js';

// Simulated seconds per in-game day
const SECONDS_PER_DAY = 86400;

// Stage thresholds in simulated days (inclusive lower bound)
const STAGE_THRESHOLDS = [
  { stage: 'elder',      minDay: 60 },
  { stage: 'adult',      minDay: 30 },
  { stage: 'youngAdult', minDay: 18 },
  { stage: 'teen',       minDay: 13 },
  { stage: 'child',      minDay:  4 },
  { stage: 'baby',       minDay:  0 },
];

// Per-stage need-decay multiplier written to sim._needMult
export const STAGE_NEED_MULT = {
  baby       : 1.4,
  child      : 1.3,
  teen       : 1.2,
  youngAdult : 1.0,
  adult      : 0.9,
  elder      : 1.1,
};

function stageForAge(ageDays) {
  for (const { stage, minDay } of STAGE_THRESHOLDS) {
    if (ageDays >= minDay) return stage;
  }
  return 'baby';
}

export class AgeSystem {
  /**
   * @param {Sim[]} sims  live Sim array (same reference as Game._sims)
   */
  constructor(sims) {
    this._sims = sims;

    // Per-sim age accumulators  { simId -> { seconds, days, stage } }
    this._data = new Map();
    for (const sim of sims) this._initSim(sim);
  }

  // ── public ──────────────────────────────────────────────────────

  update(dt) {
    for (const sim of this._sims) {
      const d = this._data.get(sim.id);
      if (!d) continue;

      d.seconds += dt;

      const newDays = Math.floor(d.seconds / SECONDS_PER_DAY);
      if (newDays <= d.days) continue;

      const oldDays  = d.days;
      d.days = newDays;

      const newStage = stageForAge(newDays);
      if (newStage !== d.stage) {
        const oldStage = d.stage;
        d.stage = newStage;
        sim._needMult = STAGE_NEED_MULT[newStage] ?? 1.0;

        bus.emit('lifecycle:stageChanged', {
          sim,
          oldStage,
          newStage,
          age: newDays,
        });

        bus.emit('story:entry', {
          text: `${sim.name} became a ${newStage} on day ${newDays}.`,
          category: 'positive',
        });
      }
    }
  }

  /** Age in simulated days for a given sim. */
  getAge(sim) {
    return this._data.get(sim.id)?.days ?? 0;
  }

  /** Life stage string for a given sim. */
  getStage(sim) {
    return this._data.get(sim.id)?.stage ?? 'youngAdult';
  }

  getInfo(simId) {
    const d = this._data.get(simId);
    if (!d) return null;
    return {
      ageDays: d.days,
      ageYears: d.days,
      stage: {
        id: d.stage,
        label: STAGE_LABELS[d.stage] ?? d.stage,
        color: STAGE_COLORS[d.stage] ?? '#aaa',
      },
    };
  }

  // ── serialise / restore ─────────────────────────────────────────

  serialise() {
    const out = {};
    for (const [id, d] of this._data) {
      out[id] = { seconds: d.seconds, days: d.days, stage: d.stage };
    }
    return out;
  }

  restore(state) {
    if (!state) return;
    for (const sim of this._sims) {
      const saved = state[sim.id];
      if (!saved) continue;
      const d = this._data.get(sim.id);
      if (!d) continue;
      d.seconds = saved.seconds ?? 0;
      d.days    = saved.days    ?? 0;
      d.stage   = saved.stage   ?? 'youngAdult';
      sim._needMult = STAGE_NEED_MULT[d.stage] ?? 1.0;
    }
  }

  /** Start tracking a newly-spawned Sim at a given age (e.g. a child grown to teen). */
  registerAt(sim, days = 13) {
    const stage = stageForAge(days);
    sim._needMult = STAGE_NEED_MULT[stage] ?? 1.0;
    this._data.set(sim.id, { seconds: days * SECONDS_PER_DAY, days, stage });
  }

  // ── private ──────────────────────────────────────────────────────

  _initSim(sim) {
    const stage = 'youngAdult';
    sim._needMult = STAGE_NEED_MULT[stage];
    this._data.set(sim.id, { seconds: 0, days: 18, stage });
  }
}

const STAGE_LABELS = {
  baby: 'Baby',
  child: 'Child',
  teen: 'Teen',
  youngAdult: 'Young Adult',
  adult: 'Adult',
  elder: 'Elder',
};

const STAGE_COLORS = {
  baby: '#ffd580',
  child: '#a5d6a7',
  teen: '#80cbc4',
  youngAdult: '#4fc3f7',
  adult: '#ce93d8',
  elder: '#b0bec5',
};

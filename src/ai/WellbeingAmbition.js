import { bus } from '../core/EventBus.js';

const CORE_NEEDS = ['hunger', 'energy', 'bladder', 'hygiene', 'comfort', 'fun', 'social', 'room'];
const WARM_ACTIONS = new Set(['chat', 'joke', 'compliment', 'hug', 'comfort', 'offer_help', 'ask_help', 'apologize', 'forgive']);
const CARE_ACTIONS = new Set(['comfort', 'offer_help', 'hug', 'chat', 'apologize', 'forgive']);
const HOSTILE_ACTIONS = new Set(['argue', 'insult', 'confront', 'avoid']);

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function avg(vals) { return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0; }

/**
 * WellbeingAmbition
 *
 * A per-Sim motivational layer: every Sim wants to be satisfied and happy. If
 * they live with others, they also care about household wellbeing, weighted by
 * personality and relationship context. It does not create hard commands; it
 * nudges UtilityAI scoring toward actions that improve self/family welfare.
 */
export class WellbeingAmbition {
  constructor(sim) {
    this._sim = sim;
    this._last = null;
    this._emitTimer = 0;
  }

  update(dt) {
    this._emitTimer -= dt;
    if (this._emitTimer > 0) return;
    this._emitTimer = 30;
    this._last = this.evaluate();
    bus.emit('wellbeing:evaluated', { simId: this._sim.id, ...this._last });
  }

  evaluate() {
    const self = this._selfScore(this._sim);
    const family = this._familyScore();
    const p = this._sim.personality ?? {};
    const familyWeight = this._familyWeight();
    const ownDrive = clamp01((72 - self.score) / 72) * (1 + Math.max(0, p.neurotic ?? 0) * 0.25);
    const familyDrive = family.available
      ? clamp01((75 - family.score) / 75) * familyWeight
      : 0;
    return {
      self,
      family,
      ownDrive,
      familyDrive,
      dominant: familyDrive > ownDrive * 1.08 ? 'family' : 'self',
    };
  }

  /** Positive/negative score modifier for an affordance. */
  boost(affordance) {
    const state = this._last ?? this.evaluate();
    const p = this._sim.personality ?? {};
    let boost = 0;

    if (affordance.targetType === 'furniture') {
      boost += this._selfUtilityBoost(affordance, state.self) * (1 + state.ownDrive);
      boost += this._homeUtilityBoost(affordance, state.family) * state.familyDrive;
    }

    if (affordance.targetType === 'sim') {
      const target = affordance.target;
      const isFamily = this._isFamily(target?.id);
      const targetWellbeing = target ? this._selfScore(target) : null;
      const verb = affordance.verb;

      if (isFamily && targetWellbeing) {
        const targetNeed = clamp01((70 - targetWellbeing.score) / 70);
        if (CARE_ACTIONS.has(verb)) boost += 16 * targetNeed * state.familyDrive;
        if (WARM_ACTIONS.has(verb)) boost += 7 * state.familyDrive;
        if (HOSTILE_ACTIONS.has(verb)) boost -= 24 * (0.6 + state.familyDrive);
      } else {
        if (WARM_ACTIONS.has(verb)) boost += Math.max(0, p.outgoing ?? 0) * 3;
      }

      // Ambitious / neurotic Sims may still confront when relationship damage is
      // high, but family ambition strongly discourages casual hostility.
      if (HOSTILE_ACTIONS.has(verb) && isFamily) boost -= Math.max(0, p.nice ?? 0) * 12;
    }

    return boost;
  }

  serialise() { return { last: this._last, emitTimer: this._emitTimer }; }
  restore(data = {}) { this._last = data.last ?? null; this._emitTimer = data.emitTimer ?? 0; }
  destroy() {}

  _selfUtilityBoost(affordance, self) {
    let out = 0;
    for (const [need, utility] of Object.entries(affordance.utility ?? {})) {
      if (utility <= 0) continue;
      const value = self.needs?.[need] ?? 65;
      const pressure = clamp01((72 - value) / 72);
      out += utility * pressure * 0.45;
    }
    return out;
  }

  _homeUtilityBoost(affordance, family) {
    if (!family.available) return 0;
    let out = 0;
    for (const [need, utility] of Object.entries(affordance.utility ?? {})) {
      if (utility <= 0) continue;
      const pressure = family.needPressures?.[need] ?? 0;
      out += utility * pressure * 0.22;
    }
    return out;
  }

  _selfScore(sim) {
    const needs = sim.needs?.getAll?.() ?? {};
    const values = CORE_NEEDS.map(n => needs[n]).filter(v => Number.isFinite(v));
    const needAvg = avg(values.length ? values : [60]);
    const lowPenalty = values.reduce((sum, v) => sum + Math.max(0, 45 - v) * 0.42, 0);
    const moodBonus = this._moodBonus(sim);
    const score = Math.max(0, Math.min(100, needAvg + moodBonus - lowPenalty));
    return { score, needs: { ...needs }, mood: sim._moodLabel ?? sim.mood?.info?.label ?? '' };
  }

  _familyScore() {
    const members = this._familyMembers().filter(s => s.id !== this._sim.id && !s._atWork);
    if (members.length === 0) return { available: false, score: 100, needPressures: {} };
    const scores = members.map(s => this._selfScore(s));
    const needPressures = {};
    for (const s of scores) {
      for (const [need, value] of Object.entries(s.needs ?? {})) {
        needPressures[need] = Math.max(needPressures[need] ?? 0, clamp01((70 - value) / 70));
      }
    }
    return {
      available: true,
      score: avg(scores.map(s => s.score)),
      members: scores.length,
      needPressures,
    };
  }

  _familyMembers() {
    const game = globalThis.window?._game;
    return (game?.sims ?? []).filter(s => !s._isVisitor && (game?.population?.isHouseholdMember?.(s.id) ?? true));
  }

  _isFamily(id) {
    if (!id) return false;
    const game = globalThis.window?._game;
    return !!game?.population?.isHouseholdMember?.(id);
  }

  _familyWeight() {
    const members = this._familyMembers();
    if (members.length <= 1) return 0;
    const p = this._sim.personality ?? {};
    return clamp01(0.45 + Math.max(0, p.nice ?? 0) * 0.35 + Math.max(0, p.outgoing ?? 0) * 0.15 - Math.max(0, -p.nice ?? 0) * 0.25);
  }

  _moodBonus(sim) {
    const label = String(sim._moodLabel ?? sim.mood?.info?.label ?? '').toLowerCase();
    if (/ecstatic|happy|good/.test(label)) return 8;
    if (/miser|sad|low|bad|angry/.test(label)) return -12;
    return 0;
  }
}

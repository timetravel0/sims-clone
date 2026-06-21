import { bus } from '../core/EventBus.js';
import { ObjectRegistry } from './ObjectRegistry.js';

const DEFAULT_CHECK_INTERVAL = 38;
const HOUSEHOLD_RESERVE = 1_000;
const MAX_DUPLICATES = 3;

const COSTS = {
  bed: 900,
  fridge: 1_200,
  toilet: 700,
  shower: 850,
  lamp: 120,
  treadmill: 1_800,
  desk: 450,
  bookshelf: 550,
  workbench: 900,
  couch: 800,
  tv: 1_500,
  bar: 1_700,
  chess: 600,
  piano: 2_200,
  hot_tub: 3_500,
  dining_table: 650,
  fire_pit: 900,
};

const NEED_WEIGHTS = {
  hunger: 1.35,
  energy: 1.25,
  bladder: 1.3,
  hygiene: 1.15,
  comfort: 0.95,
  fun: 0.85,
  social: 0.9,
  room: 0.75,
  autonomy: 0.8,
  status: 0.65,
};

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

/**
 * AutonomousShoppingSystem
 *
 * Lets household Sims buy and place furniture without player input. This is not
 * random decoration: each purchase is driven by pressure from household needs,
 * available budget, duplicate limits, and free space on the lot.
 */
export class AutonomousShoppingSystem {
  constructor(game, opts = {}) {
    this._game = game;
    this._timer = opts.timer ?? 12;
    this._interval = opts.interval ?? DEFAULT_CHECK_INTERVAL;
    this._recent = new Map(); // objectId -> cooldown seconds
    this._history = [];
  }

  update(dt) {
    this._decayRecent(dt);
    this._timer -= dt;
    if (this._timer > 0) return;
    this._timer = this._interval + Math.random() * this._interval;
    this._considerPurchase();
  }

  history() { return this._history.slice(); }

  serialise() {
    return {
      timer: this._timer,
      interval: this._interval,
      recent: Object.fromEntries(this._recent),
      history: this._history.slice(-100),
    };
  }

  restore(data = {}) {
    this._timer = data.timer ?? 12;
    this._interval = data.interval ?? DEFAULT_CHECK_INTERVAL;
    this._recent = new Map(Object.entries(data.recent ?? {}).map(([k, v]) => [k, Number(v)]));
    this._history = Array.isArray(data.history) ? data.history.slice(-100) : [];
  }

  _considerPurchase() {
    if (this._game.buildMode?.active) return;
    const budget = this._game.budgetSystem;
    if (!budget || budget.funds <= HOUSEHOLD_RESERVE + 150) return;

    const household = this._householdSims();
    if (household.length === 0) return;

    const buyer = this._chooseBuyer(household);
    const ranked = this._rankCandidates(household, buyer)
      .filter(c => c.score > 12)
      .sort((a, b) => b.score - a.score);
    if (ranked.length === 0) return;

    const pick = this._weightedPick(ranked.slice(0, 4));
    if (!pick) return;

    const placement = this._findPlacementFor(pick.def, buyer);
    if (!placement) {
      this._emitFailed(buyer, pick, 'no_space');
      return;
    }

    if (!budget.debit(pick.cost, 'autonomous_purchase', { id: pick.def.id, buyerId: buyer.id })) {
      this._emitFailed(buyer, pick, 'insufficient_funds');
      return;
    }

    const ok = this._game.world.placeFurniture({
      id: pick.def.id,
      gx: placement.gx,
      gz: placement.gz,
      color: pick.def.color,
      needTarget: pick.def.needTarget,
      restoreRate: pick.def.restoreRate,
      social: pick.def.social,
      affordances: pick.def.affordances,
    });

    if (!ok) {
      budget.credit(Math.floor(pick.cost * 0.9), 'autonomous_purchase_refund');
      this._emitFailed(buyer, pick, 'placement_failed');
      return;
    }

    this._recent.set(pick.def.id, 420);
    const row = {
      tick: this._game.tick,
      buyerId: buyer.id,
      buyerName: buyer.name,
      objectId: pick.def.id,
      objectLabel: pick.def.label,
      cost: pick.cost,
      gx: placement.gx,
      gz: placement.gz,
      reasonNeed: pick.reasonNeed,
      score: Math.round(pick.score),
      fundsAfter: budget.funds,
    };
    this._history.push(row);
    if (this._history.length > 100) this._history.shift();
    buyer.showBubble?.(`Bought ${pick.def.label}`, 2.5);
    bus.emit('household:purchase', row);
  }

  _rankCandidates(household, buyer) {
    const world = this._game.world;
    const existing = this._objectCounts();
    const pressures = this._needPressures(household);
    return ObjectRegistry.all().map(def => {
      const cost = def.cost ?? COSTS[def.id] ?? 600;
      const count = existing.get(def.id) ?? 0;
      const costRatio = cost / Math.max(1, this._game.budgetSystem?.funds ?? cost);
      const duplicatePenalty = count >= MAX_DUPLICATES ? 100 : count * 7;
      const recentPenalty = this._recent.has(def.id) ? 28 : 0;
      const utility = this._utilityScore(def, pressures);
      const scarcity = count === 0 ? 16 : 0;
      const personality = this._buyerPreference(buyer, def);
      const affordabilityPenalty = costRatio > 0.35 ? 24 : costRatio * 18;
      const spacePenalty = this._hasAnyPlacement(world) ? 0 : 100;
      const score = utility + scarcity + personality - duplicatePenalty - recentPenalty - affordabilityPenalty - spacePenalty;
      return { def, cost, score, reasonNeed: this._dominantNeed(def, pressures) };
    });
  }

  _utilityScore(def, pressures) {
    const utility = this._primaryUtility(def);
    let score = 0;
    for (const [need, amount] of Object.entries(utility)) {
      const pressure = pressures[need] ?? 0;
      const weight = NEED_WEIGHTS[need] ?? 0.5;
      score += pressure * amount * weight;
    }
    if (def.social) score += (pressures.social ?? 0) * 9;
    if (def.skill) score += (pressures.status ?? 0) * 5 + (pressures.autonomy ?? 0) * 4;
    return score;
  }

  _primaryUtility(def) {
    const out = {};
    for (const aff of def.affordances ?? []) {
      for (const [need, amount] of Object.entries(aff.utility ?? {})) {
        if (amount > 0) out[need] = Math.max(out[need] ?? 0, amount);
      }
    }
    if (def.needTarget) out[def.needTarget] = Math.max(out[def.needTarget] ?? 0, def.restoreRate ?? 8);
    return out;
  }

  _dominantNeed(def, pressures) {
    const utility = this._primaryUtility(def);
    return Object.keys(utility).sort((a, b) => (pressures[b] ?? 0) - (pressures[a] ?? 0))[0] ?? def.needTarget ?? 'room';
  }

  _buyerPreference(sim, def) {
    const p = sim.personality ?? {};
    let score = 0;
    if (def.social) score += Math.max(0, p.outgoing ?? 0) * 9;
    if (['bookshelf', 'desk', 'chess', 'workbench'].includes(def.id)) score += Math.max(0, p.ambitious ?? 0) * 8;
    if (['tv', 'piano', 'bar', 'fire_pit', 'hot_tub'].includes(def.id)) score += Math.max(0, p.playful ?? 0) * 7;
    if (['bed', 'couch', 'lamp'].includes(def.id)) score += Math.max(0, p.neurotic ?? 0) * 5;
    return score;
  }

  _needPressures(household) {
    const out = {};
    for (const sim of household) {
      const all = sim.needs?.getAll?.() ?? {};
      for (const [need, value] of Object.entries(all)) {
        const pressure = clamp01((65 - value) / 65);
        out[need] = Math.max(out[need] ?? 0, pressure);
      }
    }
    // Derived pressures: lack of progress/status can justify skill/status objects.
    out.status = Math.max(out.status ?? 0, 0.25);
    out.autonomy = Math.max(out.autonomy ?? 0, 0.2);
    return out;
  }

  _chooseBuyer(household) {
    return household.slice().sort((a, b) => this._purchaseDrive(b) - this._purchaseDrive(a))[0];
  }

  _purchaseDrive(sim) {
    const needs = sim.needs?.getAll?.() ?? {};
    const lowNeed = Math.max(...Object.values(needs).map(v => clamp01((60 - v) / 60)), 0);
    const p = sim.personality ?? {};
    return lowNeed + Math.max(0, p.ambitious ?? 0) * 0.25 + Math.max(0, p.neurotic ?? 0) * 0.15;
  }

  _findPlacementFor(def, buyer) {
    const preferred = [
      { gx: buyer.gx + 1, gz: buyer.gz },
      { gx: buyer.gx - 1, gz: buyer.gz },
      { gx: buyer.gx, gz: buyer.gz + 1 },
      { gx: buyer.gx, gz: buyer.gz - 1 },
    ];
    for (const p of preferred) if (this._validCell(p.gx, p.gz)) return p;

    const anchor = this._anchorFor(def) ?? buyer;
    for (let r = 1; r <= 7; r++) {
      const cells = [];
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) + Math.abs(dz) !== r) continue;
          cells.push({ gx: anchor.gx + dx, gz: anchor.gz + dz });
        }
      }
      cells.sort((a, b) => Math.hypot(a.gx - buyer.gx, a.gz - buyer.gz) - Math.hypot(b.gx - buyer.gx, b.gz - buyer.gz));
      const found = cells.find(c => this._validCell(c.gx, c.gz));
      if (found) return found;
    }
    return null;
  }

  _anchorFor(def) {
    const sameNeed = this._game.world.furniture.find(f => f.needTarget === def.needTarget);
    if (sameNeed) return sameNeed;
    return this._game.world.furniture.find(f => f.social === def.social) ?? this._game.world.furniture[0] ?? null;
  }

  _validCell(gx, gz) {
    const world = this._game.world;
    if (gx == null || gz == null) return false;
    if (gx <= 0 || gz <= 0 || gx >= world.tilemap.width - 1 || gz >= world.tilemap.height - 1) return false;
    return world.isCellAvailable(gx, gz);
  }

  _hasAnyPlacement(world) {
    for (let z = 1; z < world.tilemap.height - 1; z++) {
      for (let x = 1; x < world.tilemap.width - 1; x++) if (world.isCellAvailable(x, z)) return true;
    }
    return false;
  }

  _objectCounts() {
    const out = new Map();
    for (const f of this._game.world?.furniture ?? []) out.set(f.id, (out.get(f.id) ?? 0) + 1);
    return out;
  }

  _householdSims() {
    return (this._game.sims ?? []).filter(s => !s._isVisitor && !s._atWork && (this._game.population?.isHouseholdMember?.(s.id) ?? true));
  }

  _weightedPick(candidates) {
    const weights = candidates.map(c => Math.max(1, c.score));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i];
      if (r <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1] ?? null;
  }

  _decayRecent(dt) {
    for (const [id, left] of this._recent) {
      const next = left - dt;
      if (next <= 0) this._recent.delete(id);
      else this._recent.set(id, next);
    }
  }

  _emitFailed(buyer, pick, reason) {
    bus.emit('household:purchaseFailed', {
      tick: this._game.tick,
      buyerId: buyer?.id ?? '',
      buyerName: buyer?.name ?? '',
      objectId: pick?.def?.id ?? '',
      objectLabel: pick?.def?.label ?? '',
      cost: pick?.cost ?? 0,
      reason,
    });
  }
}

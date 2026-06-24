import { bus } from '../core/EventBus.js';
import { ObjectRegistry } from './ObjectRegistry.js';
import { OBJECT_COSTS } from '../config/objectCatalog.js';
import { skillSystem } from './SkillSystem.js';

const CRAFT_NOUNS = { fun: 'gadget', comfort: 'stool', room: 'sculpture', energy: 'recliner' };

const DEFAULT_CHECK_INTERVAL = 38;
const HOUSEHOLD_RESERVE = 1_000;
const MAX_DUPLICATES = 3;

// Chronic-contention buying. The instantaneous "is an equivalent free right now?"
// gate misses bursty contention: a single toilet/bed serving 3 Sims looks free at
// most random check instants, yet drives most need crises. We accumulate a
// decaying pressure per need from need:crisis events; when a need keeps cratering
// the household buys another instance of whatever serves it, free-snapshot or not.
const CRISIS_DECAY = 0.0025;   // per scaled-second
const CRISIS_THRESHOLD = 1.5;  // pressure above which a second instance is justified

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
    this._craftCd = opts.craftCd ?? 0;        // scaled-seconds until the next craft is allowed
    this._crisis = new Map();                 // need -> decaying crisis pressure
    bus.on('sim:objectUsed', e => this._maybeCraft(e));
    bus.on('need:crisis', e => {
      if (!e?.need) return;
      this._crisis.set(e.need, (this._crisis.get(e.need) ?? 0) + 1);
    });
  }

  update(dt) {
    if (this._craftCd > 0) this._craftCd -= dt;
    this._decayCrisis(dt);
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
      craftCd: this._craftCd,
      crisis: Object.fromEntries(this._crisis),
    };
  }

  restore(data = {}) {
    this._timer = data.timer ?? 12;
    this._interval = data.interval ?? DEFAULT_CHECK_INTERVAL;
    this._recent = new Map(Object.entries(data.recent ?? {}).map(([k, v]) => [k, Number(v)]));
    this._history = Array.isArray(data.history) ? data.history.slice(-100) : [];
    this._craftCd = data.craftCd ?? 0;
    this._crisis = new Map(Object.entries(data.crisis ?? {}).map(([k, v]) => [k, Number(v)]));
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

  /**
   * A skilled Sim finishing at the workbench can craft a brand-new object whose
   * characteristics (need served, restore rate, utility) scale with handiness.
   */
  _maybeCraft({ sim, objectType } = {}) {
    if (objectType !== 'workbench' || !sim) return;
    if (sim._isVisitor || sim._atWork || sim._outing) return;
    if (this._craftCd > 0) return;
    const handiness = skillSystem.getLevel(sim, 'handiness');
    if (handiness < 2) return;
    if (Math.random() > 0.15 + handiness * 0.05) return;

    const need = Object.keys(CRAFT_NOUNS)[Math.floor(Math.random() * 4)];
    const candidate = {
      label: `${sim.name}'s ${CRAFT_NOUNS[need]}`,
      color: 0x8d6e63,
      needTarget: need,
      restoreRate: 6 + handiness,
      cost: 0,
      description: `Handcrafted by ${sim.name} (handiness ${handiness}).`,
      affordances: [{ verb: 'use', label: 'Use', utility: { [need]: 10 + handiness * 2, fun: 4 }, duration: 4 }],
    };

    // ponytail: skip capacity check for crafted objects — they're free (cost=0)
    // and expressive; the cooldown + probability gate already prevents spam.
    const def = this._game.createCustomObject?.(candidate);
    if (!def) return;

    const placement = this._findPlacementFor(def, sim);
    if (!placement) return;
    const ok = this._game.world.placeFurniture({
      id: def.id, gx: placement.gx, gz: placement.gz, color: def.color,
      needTarget: def.needTarget, restoreRate: def.restoreRate, social: def.social,
      affordances: def.affordances,
    });
    if (!ok) return;

    this._craftCd = 600;
    sim.showBubble?.(`Crafted ${def.label}`, 2.5);
    bus.emit('household:crafted', {
      tick: this._game.tick, makerId: sim.id, makerName: sim.name,
      objectId: def.id, objectLabel: def.label, needTarget: need,
      restoreRate: def.restoreRate, gx: placement.gx, gz: placement.gz,
    });
    bus.emit('story:entry', {
      text: `${sim.name} crafted a ${CRAFT_NOUNS[need]} at the workbench.`,
      cat: 'family', category: 'family',
    });
  }

  _rankCandidates(household, buyer) {
    const world = this._game.world;
    const existing = this._objectCounts();
    const pressures = this._needPressures(household);
    return ObjectRegistry.all()
      .filter(def => this._needsAdditionalInstance(def, household) || this._servesChronicCrisis(def))
      .map(def => {
        const cost = def.cost ?? OBJECT_COSTS[def.id] ?? 600;
        const count = existing.get(def.id) ?? 0;
        const costRatio = cost / Math.max(1, this._game.budgetSystem?.funds ?? cost);
        const duplicatePenalty = count >= MAX_DUPLICATES ? 100 : count * 7;
        const recentPenalty = this._recent.has(def.id) ? 28 : 0;
        const utility = this._utilityScore(def, pressures);
        const scarcity = count === 0 ? 16 : 0;
        const personality = this._buyerPreference(buyer, def);
        const affordabilityPenalty = costRatio > 0.35 ? 24 : costRatio * 18;
        const spacePenalty = this._hasAnyPlacement(world) ? 0 : 100;
        const crisisBonus = this._crisisBonus(def);
        const score = utility + scarcity + personality + crisisBonus - duplicatePenalty - recentPenalty - affordabilityPenalty - spacePenalty;
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
    // Search outward from a sensible anchor (existing similar furniture, else the
    // buyer), nearest-to-buyer first. We do NOT prefer cells next to the buyer:
    // dropping furniture beside a Sim is exactly what boxes people in.
    const anchor = this._anchorFor(def) ?? buyer;
    const maxR = this._game.world.tilemap.width + this._game.world.tilemap.height;
    for (let r = 1; r <= maxR; r++) {
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
    if (!world.isCellAvailable(gx, gz)) return false;
    if (this._protectedCells().has(`${gx},${gz}`)) return false;  // keep doors/entries clear
    if (this._adjacentToSim(gx, gz)) return false;                // don't drop next to a Sim
    if (this._wouldBlock(gx, gz)) return false;                   // don't sever the walkable area
    return true;
  }

  /**
   * True only when the household genuinely needs another instance.
   *
   * Rule: do not buy an object if an equivalent object already exists and is
   * free. "Equivalent" is broader than same id: a free object that restores the
   * same need or offers the same affordance verbs already satisfies the desire.
   * A duplicate is justified only when every useful equivalent is occupied or
   * there are fewer useful free instances than simultaneous pressured Sims.
   */
  _needsAdditionalInstance(def, household) {
    const existing = this._equivalentFurniture(def);
    if (existing.length === 0) return true;

    // Cap: never more than ceil(household / 3), minimum 2 — avoids furniture pileups with large families
    const cap = Math.max(2, Math.ceil(household.length / 3));
    if (existing.length >= cap) return false;

    const free = existing.filter(f => this._isFurnitureFree(f));
    if (free.length === 0) return true;

    const dominantNeed = this._dominantNeed(def, this._needPressures(household));
    const demand = household.filter(sim => this._needPressureFor(sim, dominantNeed) > 0.45).length;

    return demand > free.length;
  }

  _equivalentFurniture(def) {
    const wantedVerbs = new Set((def.affordances ?? []).map(a => a.verb).filter(Boolean));
    const wantedNeeds = new Set(Object.keys(this._primaryUtility(def)));
    return (this._game.world?.furniture ?? []).filter(f => {
      if (f.id === def.id) return true;
      if (def.needTarget && f.needTarget === def.needTarget) return true;
      if (def.social && f.social) return true;
      const fDef = ObjectRegistry.get(f.id) ?? f;
      const fVerbs = new Set((fDef.affordances ?? f.affordances ?? []).map(a => a.verb).filter(Boolean));
      for (const verb of wantedVerbs) if (fVerbs.has(verb)) return true;
      const fNeeds = new Set(Object.keys(this._primaryUtility(fDef)));
      for (const need of wantedNeeds) if (fNeeds.has(need)) return true;
      return false;
    });
  }

  _isFurnitureFree(furniture) {
    return !furniture.inUse && !furniture.reservedBy;
  }

  _needPressureFor(sim, need) {
    const value = sim.needs?.getAll?.()[need];
    if (typeof value !== 'number') return 0;
    return clamp01((65 - value) / 65);
  }

  /** Door/entry cells visitors and Sims must keep walking through. */
  _protectedCells() {
    const set = new Set();
    for (const p of this._game.world?.entryPoints ?? []) {
      for (const [x, z] of [[p.insideGx, p.insideGz], [p.spawnGx, p.spawnGz], [p.porchGx, p.porchGz]]) {
        if (x != null && z != null) set.add(`${x},${z}`);
      }
    }
    return set;
  }

  _adjacentToSim(gx, gz) {
    return (this._game.sims ?? []).some(s => {
      if (s._atWork || s._outing) return false;
      return Math.abs(Math.round(s.worldX) - gx) + Math.abs(Math.round(s.worldZ) - gz) <= 1;
    });
  }

  /**
   * Would placing furniture on (gx,gz) cut off part of the lot? Compares the
   * walkable area reachable with the cell open vs blocked: if blocking removes
   * more than just the cell itself, it's a chokepoint and we refuse it.
   * Relative check so pre-existing isolated regions don't poison the result.
   */
  _wouldBlock(gx, gz) {
    const tm = this._game.world.tilemap;
    let start = null;
    for (const s of this._game.sims ?? []) {
      const sx = Math.round(s.worldX), sz = Math.round(s.worldZ);
      if (tm.isWalkable(sx, sz) && !(sx === gx && sz === gz)) { start = { x: sx, z: sz }; break; }
    }
    if (!start) {
      for (let z = 0; z < tm.height && !start; z++)
        for (let x = 0; x < tm.width && !start; x++)
          if (tm.isWalkable(x, z) && !(x === gx && z === gz)) start = { x, z };
    }
    if (!start) return false;
    return this._reachCount(start, null, null) - this._reachCount(start, gx, gz) > 1;
  }

  _reachCount(start, blockX, blockZ) {
    const world = this._game.world;
    const tm = world.tilemap;
    const passable = (x1, z1, x2, z2) => world.wallManager?.isPassable(x1, z1, x2, z2) ?? true;
    const seen = new Set([`${start.x},${start.z}`]);
    const stack = [start];
    while (stack.length) {
      const { x, z } = stack.pop();
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx === blockX && nz === blockZ) continue;
        if (!tm.isWalkable(nx, nz)) continue;
        if (!passable(x, z, nx, nz)) continue;
        const k = `${nx},${nz}`;
        if (!seen.has(k)) { seen.add(k); stack.push({ x: nx, z: nz }); }
      }
    }
    return seen.size;
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
    return (this._game.sims ?? []).filter(s => !s._isVisitor && !s._atWork && !s._outing && (this._game.population?.isHouseholdMember?.(s.id) ?? true));
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

  _decayCrisis(dt) {
    for (const [need, p] of this._crisis) {
      const next = p - dt * CRISIS_DECAY;
      if (next <= 0.05) this._crisis.delete(need);
      else this._crisis.set(need, next);
    }
  }

  /** Needs this object would relieve that are under chronic crisis pressure. */
  _crisisNeeds(def) {
    return Object.keys(this._primaryUtility(def)).filter(n => (this._crisis.get(n) ?? 0) >= CRISIS_THRESHOLD);
  }

  _servesChronicCrisis(def) {
    return this._crisisNeeds(def).length > 0;
  }

  /** Strong score boost for buying what relieves a chronically-crisised need. */
  _crisisBonus(def) {
    let bonus = 0;
    for (const need of Object.keys(this._primaryUtility(def))) {
      bonus += (this._crisis.get(need) ?? 0) * 14;
    }
    return bonus;
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

import { bus } from '../core/EventBus.js';

/**
 * HouseholdPlanner — WP9 / Milestone 13 (capstone).
 *
 * The unified, explainable household decision loop. Once per day it:
 *   observe() → detect bottlenecks → rank() interventions by urgency
 *   (gated by affordability and nudged by household personality) → execute the
 *   single top intervention → log a reason (`household:plan`).
 *
 * It does NOT reimplement behaviour — it coordinates the existing autonomous
 * systems (doctor, construction, layout, shopping) so household improvements
 * become deliberate, ranked, logged plans instead of isolated reactions.
 */
const MIN_URGENCY  = 0.3;   // ignore interventions below this
const LAND_RESERVE = 7500;  // funds needed to consider building (cost + reserve)

export class HouseholdPlanner {
  constructor(game) {
    this._game = game;
    this._plans = 0;
    this._off = bus.on('clock:dayChanged', () => this.plan());
  }

  get plansMade() { return this._plans; }

  /** Snapshot of household state (also handy from the console). */
  observe() {
    const g = this._game;
    const sims = (g.sims ?? []).filter(s => !s._isVisitor);
    const funds = g.budgetSystem?.funds ?? 0;
    const ill = (g.population?.householdMembers?.() ?? [])
      .filter(p => (p.health?.state ?? 'healthy') !== 'healthy' && !p.dead)
      .map(p => ({ id: p.id, name: p.name, severity: p.health?.severity ?? 0.3 }));
    // Average need pressure across the household (0..1, higher = more starved).
    const pressures = {};
    for (const key of ['hunger', 'energy', 'bladder', 'hygiene', 'fun', 'social', 'comfort']) {
      const vals = sims.map(s => s.needs?.get?.(key) ?? 100);
      pressures[key] = vals.length ? Math.max(0, (100 - vals.reduce((a, b) => a + b, 0) / vals.length) / 100) : 0;
    }
    const ambition = sims.length
      ? sims.reduce((a, s) => a + Math.max(0, s.personality?.ambitious ?? 0), 0) / sims.length : 0;
    return { sims, funds, ill, pressures, ambition };
  }

  /** Ranked candidate interventions (highest urgency first). */
  rank() {
    const g = this._game;
    const s = this.observe();
    const out = [];

    // 1. Treat the most severe illness.
    const worstIll = s.ill.sort((a, b) => b.severity - a.severity)[0];
    if (worstIll) {
      out.push({
        type: 'treat_illness', urgency: Math.min(1, 0.5 + worstIll.severity * 0.5),
        reason: `${worstIll.name} è malato/a (gravità ${(worstIll.severity * 100) | 0}%)`,
        exec: () => g.doctor?.book?.(worstIll.id),
      });
    }

    // 2. Build a room when the household has outgrown it.
    const buildReason = g.construction?._needReason?.();
    if (buildReason && s.funds >= LAND_RESERVE) {
      out.push({
        type: 'build_room', urgency: 0.6 * (1 + s.ambition * 0.3),
        reason: 'la famiglia non ha abbastanza letti',
        exec: () => g.construction?.build?.(buildReason),
      });
    }

    // 3. Buy furniture for the most pressured need.
    const [needKey, needPressure] = Object.entries(s.pressures).sort((a, b) => b[1] - a[1])[0] ?? [];
    if (needKey && needPressure > 0.4 && s.funds > 600) {
      out.push({
        type: 'buy_object', urgency: needPressure * (1 + s.ambition * 0.2),
        reason: `bisogno "${needKey}" sotto pressione (${(needPressure * 100) | 0}%)`,
        exec: () => g.autonomousShopping?._considerPurchase?.(),
      });
    }

    // 4. Clean the kitchen when hygiene has dropped (needs a sink).
    const kh = g.world?.kitchenHygiene ?? 100;
    const hasSink = (g.world?.furniture ?? []).some(f => f.functionTags?.includes('wash'));
    if (hasSink && kh < 70) {
      out.push({
        type: 'clean_kitchen', urgency: (100 - kh) / 100,
        reason: `cucina sporca (igiene ${kh | 0}%)`,
        exec: () => g.world?.washDishes?.(),
      });
    }

    // 5. Rearrange furniture when the layout scores poorly.
    const layout = g.layoutPlanner?.score?.();
    const issues = layout?.issues?.length ?? 0;
    if (issues > 0) {
      out.push({
        type: 'rearrange', urgency: Math.min(0.5, issues * 0.15),
        reason: `layout migliorabile (${issues} problemi)`,
        exec: () => g.layoutPlanner?.autoRearrange?.(),
      });
    }

    return out.sort((a, b) => b.urgency - a.urgency);
  }

  /** Execute the single most urgent intervention for today and log the reason. */
  plan() {
    const ranked = this.rank();
    const top = ranked.find(c => c.urgency >= MIN_URGENCY);
    if (!top) return null;
    top.exec?.();
    this._plans += 1;
    bus.emit('household:plan', {
      intervention: top.type, reason: top.reason,
      urgency: +top.urgency.toFixed(2), day: this._game.clock?.day ?? 0,
    });
    bus.emit('story:entry', {
      text: `🏠 Piano di famiglia: ${top.reason} → ${top.type}.`,
      cat: 'family', category: 'family',
    });
    return top;
  }

  serialise() { return { plans: this._plans }; }
  restore(d = {}) { this._plans = d.plans ?? 0; }
  dispose() { this._off?.(); }
}

import { Action, WalkToAction } from './Action.js';
import { bus }          from '../core/EventBus.js';
import { budgetSystem } from '../systems/BudgetSystem.js';
import { skillSystem }  from '../systems/SkillSystem.js';
import { pickRecipe }   from '../config/recipes.js';

const MEAL_COST = 15; // § per meal — parity with the old fridge eat
// Hunger restored by meal quality tier.
const QUALITY_HUNGER = { poor: 30, normal: 45, good: 55, excellent: 65 };
// Nutrition score per quality tier (0..1) — feeds energy and long-term health (M12).
export const QUALITY_SCORE = { poor: 0.25, normal: 0.55, good: 0.8, excellent: 1.0 };

/**
 * Food-poisoning chance for a meal (M12): worse quality → higher risk, but a
 * skilled cook handles food safely. Returns a probability 0..1.
 */
export function poisoningChance(tier, cookSkill = 0) {
  const base = { poor: 0.20, normal: 0.06, good: 0.02, excellent: 0 }[tier] ?? 0;
  return Math.max(0, base * (1 - Math.min(10, cookSkill) / 10));
}

/** Rolling nutrition average (0..1) for a Sim from a freshly eaten meal. */
export function updateNutrition(sim, qualityScore) {
  const prev = sim._nutrition ?? 0.6;
  sim._nutrition = +(prev * 0.7 + qualityScore * 0.3).toFixed(3);
  return sim._nutrition;
}

/**
 * CookMealAction — WP3 food lifecycle (Milestone 7).
 *
 * Replaces the fridge's direct hunger fix with a real pipeline run as ONE
 * composite action with an internal phase machine:
 *
 *   fridge (ingredients) → counter (prep) → stove/oven (cook) → table → eat
 *
 * Robust by design: each leg is optional and a failed walk (no path) just skips
 * that station — hunger is always restored at the end, so a bare or crowded lot
 * never causes starvation. Missing appliances lower meal quality (raw = poor);
 * eating without a table costs comfort. Quality scales with cooking skill and
 * can cause food poisoning when poor. A served meal feeds other present, hungry
 * household members (group meal).
 */
export class CookMealAction extends Action {
  constructor(sim, world, fridge = null) {
    super('CookMeal');
    this._sim = sim;
    this._world = world;
    this._fridge = fridge ?? world.furniture.find(f => f.id === 'fridge');
  }

  enter() {
    if (!budgetSystem.debit(MEAL_COST, 'meal', { simId: this._sim.id, simName: this._sim.name })) {
      bus.emit('food:eatAborted', {
        simId: this._sim.id, simName: this._sim.name,
        reason: 'budget_insufficient',
        hunger: this._sim.needs?.get?.('hunger') ?? -1,
        budget: budgetSystem.funds,
      });
      this.done = true;
      return;
    }

    const f = this._world.furniture;
    this._prep      = f.find(o => o.functionTags?.includes('prep'));
    this._appliance = f.find(o => o.functionTags?.includes('cook') && o.id !== 'fridge');
    this._table     = f.find(o => o.functionTags?.includes('eat') && o.id !== 'fridge');
    this._cookSkill = skillSystem.getLevel?.(this._sim, 'cooking') ?? 0;
    this._recipe    = pickRecipe(this._cookSkill);

    // Build the leg sequence from whatever stations exist. The final 'eat' leg
    // happens at the table when present, otherwise wherever the Sim ended up.
    this._steps = [];
    if (this._fridge)    this._steps.push({ f: this._fridge,    dwell: 2 });
    if (this._prep)      this._steps.push({ f: this._prep,      dwell: 3 });
    if (this._appliance) this._steps.push({ f: this._appliance, dwell: 4 });
    if (this._table)     this._steps.push({ f: this._table,     dwell: 0 });
    this._steps.push({ f: null, dwell: 5, eat: true });

    this._i = -1;
    this._advance();
  }

  _advance() {
    this._i++;
    if (this._i >= this._steps.length) { this._finish(); return; }
    const step = this._steps[this._i];
    this._dwell = step.dwell;
    if (step.f) {
      const h  = this._world.tilemap.height;
      const gz = step.f.gz + 1 < h ? step.f.gz + 1 : step.f.gz - 1;
      this._sub = new WalkToAction(this._sim, this._world, step.f.gx, gz);
      this._sub.enter();
    } else {
      this._sub = null;
    }
  }

  update(dt) {
    if (this.done) return;
    if (this._sub && !this._sub.done) { this._sub.update(dt); return; }
    this._sub = null;
    this._dwell -= dt;
    if (this._dwell <= 0) this._advance();
  }

  _finish() {
    let tier = this._cookSkill >= 8 ? 'excellent'
             : this._cookSkill >= 5 ? 'good'
             : this._cookSkill >= 2 ? 'normal' : 'poor';
    if (!this._appliance && !this._prep) tier = 'poor'; // eaten raw
    const gain = QUALITY_HUNGER[tier];
    const score = QUALITY_SCORE[tier];

    this._sim.needs?.restore?.('hunger', gain);
    this._sim.needs?.restore?.('energy', score * 5); // nutrition → a little energy (M12)
    updateNutrition(this._sim, score);
    if (this._table) {
      this._sim.needs?.restore?.('comfort', 5);
      this._sim.needs?.restore?.('social', 8);
      this._sim.needs?.restore?.('status', 4);
    } else {
      this._sim.needs?.decay?.('comfort', 3); // ate standing
    }
    skillSystem.gain?.(this._sim, 'cooking', 0.2);

    bus.emit('food:cooked', {
      simId: this._sim.id, simName: this._sim.name,
      recipe: this._recipe.id, quality: tier,
    });

    // Group meal: feed other present, hungry household members from the servings.
    let served = 1;
    if (this._table && this._recipe.servings > 1) {
      const sims = globalThis.window?._game?.sims ?? [];
      const others = sims.filter(s =>
        s.id !== this._sim.id && !s._isVisitor && !s._atWork && !s._outing &&
        (s.needs?.get?.('hunger') ?? 100) < 60);
      for (const o of others) {
        if (served >= this._recipe.servings) break;
        o.needs?.restore?.('hunger', gain * 0.8);
        o.needs?.restore?.('social', 6);
        updateNutrition(o, score);
        served++;
      }
    }

    bus.emit('food:eaten', {
      simId: this._sim.id, simName: this._sim.name,
      recipe: this._recipe.id, quality: tier, servings: served,
    });

    // Cooking dirties the kitchen (WP3/WP8 dish-washing loop).
    this._world.soilKitchen?.(1);

    // Food poisoning arises from the actual meal (M12): worse quality + lower
    // cooking skill → higher risk, amplified by a dirty kitchen.
    const hygieneMult = 1 + (100 - (this._world.kitchenHygiene ?? 100)) / 100;
    if (Math.random() < poisoningChance(tier, this._cookSkill) * hygieneMult) {
      bus.emit('food:poisoning', { simId: this._sim.id, simName: this._sim.name, quality: tier });
      globalThis.window?._game?.healthSystem?.reportIncident?.(
        this._sim.id, 0.5, 'food_poisoning', { illness: 'food poisoning', cause: 'food_poisoning' });
    }

    bus.emit('story:entry', {
      simId: this._sim.id,
      text: `${this._sim.name} cooked ${this._recipe.label} (${tier})${served > 1 ? ` for ${served}` : ''}.`,
      cat: 'family', category: 'family',
    });
    this.done = true;
  }

  exit() {
    if (this._fridge?.reservedBy === this._sim.id) this._fridge.reservedBy = null;
  }
}

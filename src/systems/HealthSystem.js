import { bus } from '../core/EventBus.js';
import { memorySystem } from './MemorySystem.js';
import { budgetSystem } from './BudgetSystem.js';
import cfg from '../config/gameConfig.js';

const ILLNESSES = [
  { id: 'cold', label: 'cold' },
  { id: 'flu', label: 'flu' },
  { id: 'fatigue', label: 'fatigue' },
  { id: 'food_poisoning', label: 'food poisoning' },
];

// Starvation ladder (in HealthSystem update cycles, each ~28 game-seconds)
const STARVE_HUNGER_MAX  = 10;   // hunger below this = starving
const STARVE_ILL_CYCLES  = 5;    // cycles before illness (~2 game-minutes)
const STARVE_DEATH_CYCLES = 25;  // cycles before death  (~12 game-minutes total)

export class HealthSystem {
  constructor(game, opts = {}) {
    this._game = game;
    this._timer = opts.timer ?? 0;
    this._interval = opts.interval ?? 28;
  }

  update(dt) {
    this._timer += dt;
    if (this._timer < this._interval) return;
    this._timer = 0;
    for (const person of this._game.population?.allPeople?.() ?? []) this._updatePerson(person);
  }

  reportIncident(personId, severity = 0.45, cause = 'offlot_incident', details = {}) {
    const person = this._game.population?.getPerson?.(personId);
    if (!person) return null;
    const illness = person.health?.illness ?? this._pickIllness(details);
    const state = person.health?.state ?? 'healthy';
    const nextSeverity = Math.min(1, Math.max(person.health?.severity ?? 0, severity));
    if (state === 'healthy') {
      this._setIll(person, illness, nextSeverity, { cause, ...details });
    } else {
      person.health.severity = nextSeverity;
      person.health.incidentAtTick = this._game.tick ?? 0;
      bus.emit('health:stateChanged', {
        personId: person.id,
        personName: person.name,
        state,
        severity: nextSeverity,
        illness,
        cause,
        ...details,
      });
    }
    memorySystem.record?.(person.activeSimId ?? person.id, 'health', {
      type: cause,
      illness,
      severity: nextSeverity,
      ...details,
    }, nextSeverity, -0.55, 0.002);
    bus.emit('offlot:incident', {
      personId: person.id,
      personName: person.name,
      severity: nextSeverity,
      cause,
      illness,
      ...details,
    });
    return person.health;
  }

  getState(personId) {
    return this._game.population?.getPerson?.(personId)?.health ?? null;
  }

  /**
   * Apply a medical treatment outcome (M11). Either resolves the illness or
   * reduces its severity. Returns true if anything changed.
   */
  treat(personId, { resolve = true, drop = 0.4 } = {}) {
    const person = this._game.population?.getPerson?.(personId);
    if (!person || (person.health?.state ?? 'healthy') === 'healthy') return false;
    if (resolve) {
      this._recover(person, { cause: 'treatment' });
      return true;
    }
    person.health.severity = Math.max(0, (person.health.severity ?? 0) - drop);
    return true;
  }

  serialise() {
    return {
      timer: this._timer,
      interval: this._interval,
    };
  }

  restore(data = {}) {
    this._timer = data.timer ?? 0;
    this._interval = data.interval ?? 28;
  }

  _updatePerson(person) {
    if (person.dead) return;
    const sim = this._game.sims?.find?.(s => s.id === person.id) ?? null;
    const health = person.health ?? { state: 'healthy', severity: 0 };

    // ── Starvation ladder ────────────────────────────────────────────────────
    if (sim) {
      const hunger = sim.needs?.get?.('hunger') ?? 100;
      if (hunger < STARVE_HUNGER_MAX) {
        person._starveCycles = (person._starveCycles ?? 0) + 1;
        const c = person._starveCycles;
        bus.emit('health:starvationProgressed', {
          simId: person.id, simName: person.name,
          cycles: c, maxCycles: STARVE_DEATH_CYCLES,
          hunger, budget: budgetSystem.funds,
        });
        if (c >= STARVE_DEATH_CYCLES) {
          // A reachable fridge means food is available — grab an emergency bite
          // rather than starving to death (the user's core complaint). Death by
          // starvation only happens when the household truly has no food source.
          if (this._emergencyFeed(sim)) { person._starveCycles = 0; }
          else { this._killSim(person, sim); return; }
        }
        if (c >= STARVE_ILL_CYCLES && health.state === 'healthy') {
          this._setIll(person, 'starvation', 0.75, { cause: 'starvation' });
        }
      } else {
        person._starveCycles = 0; // reset when Sim has eaten
      }
    }

    if (health.state === 'healthy') {
      const chance = this._illnessChance(person, sim);
      if (Math.random() < chance) {
        this._setIll(person, this._pickIllness({ person, sim }), Math.min(1, 0.35 + chance * 3), { cause: 'natural' });
      }
      return;
    }

    if (sim) {
      const factor = health.state === 'ill' ? 1 : 0.45;
      sim.needs?.delta?.('energy', -0.018 * factor);
      sim.needs?.delta?.('fun', -0.01 * factor);
      sim.needs?.delta?.('social', -0.006 * factor);
    }

    const elapsed = (this._game.tick ?? 0) - (health.startedAtTick ?? this._game.tick ?? 0);
    const recoveryDelay = Math.round((cfg.health?.recoveryBase ?? 120) + (health.severity ?? 0) * (cfg.health?.recoverySeverity ?? 180));
    if (health.state === 'ill' && elapsed >= recoveryDelay) {
      person.health.state = 'recovering';
      person.health.recoverAtTick = this._game.tick ?? 0;
      bus.emit('health:stateChanged', {
        personId: person.id,
        personName: person.name,
        previous: 'ill',
        state: 'recovering',
        illness: health.illness,
        severity: health.severity,
      });
      return;
    }

    if (health.state === 'recovering') {
      const recoverElapsed = (this._game.tick ?? 0) - (health.recoverAtTick ?? this._game.tick ?? 0);
      if (recoverElapsed >= 90 && Math.random() < 0.55) this._recover(person, { cause: 'natural' });
    }
  }

  _recover(person, meta = {}) {
    const prev = person.health?.state ?? 'ill';
    person.health = {
      ...(person.health ?? {}),
      state: 'healthy',
      illness: null,
      severity: 0,
      startedAtTick: null,
      recoverAtTick: null,
      incidentAtTick: null,
    };
    bus.emit('health:recover', {
      personId: person.id,
      personName: person.name,
      previous: prev,
      state: 'healthy',
      ...meta,
    });
    bus.emit('health:stateChanged', {
      personId: person.id,
      personName: person.name,
      previous: prev,
      state: 'healthy',
      ...meta,
    });
  }

  _setIll(person, illness, severity, meta = {}) {
    const prev = person.health?.state ?? 'healthy';
    const next = this._game.population?.setHealthState?.(person.id, 'ill', {
      illness,
      severity: Math.min(1, Math.max(severity, person.health?.severity ?? 0)),
      startedAtTick: this._game.tick ?? 0,
      incidentAtTick: meta.cause === 'offlot_incident' ? (this._game.tick ?? 0) : null,
      cause: meta.cause ?? 'natural',
      location: meta.location ?? null,
    });
    person.health = next ?? person.health;
    if (prev !== 'ill') {
      bus.emit('story:entry', {
        simId: person.id,
        text: `${person.name} came down with ${illness}.`,
        cat: 'drama',
        category: 'drama',
      });
    }
  }

  /**
   * Last-resort feed when starvation would otherwise kill: if the household has
   * a fridge (food storage), the Sim grabs an emergency bite instead of dying.
   * Returns true if fed. This makes starvation death possible only when there
   * is genuinely no reachable food source.
   */
  _emergencyFeed(sim) {
    const furniture = this._game.world?.furniture ?? [];
    const hasFood = furniture.some(f => f.id === 'fridge' || f.functionTags?.includes('food_storage'));
    if (!hasFood) return false;
    sim.needs?.restore?.('hunger', 45);
    bus.emit('story:entry', {
      simId: sim.id,
      text: `${sim.name} ha rimediato un boccone d'emergenza per non morire di fame.`,
      cat: 'family', category: 'family',
    });
    return true;
  }

  _killSim(person, sim) {
    person.dead = true;
    person._starveCycles = 0;
    if (sim) {
      if (sim.mesh) sim.mesh.visible = false;
      const idx = this._game.sims?.indexOf?.(sim) ?? -1;
      if (idx >= 0) this._game.sims.splice(idx, 1);
      this._game.population?.deactivatePerson?.(person.id);
    }
    bus.emit('sim:died', { personId: person.id, personName: person.name, cause: 'starvation' });
    bus.emit('story:entry', {
      text: `${person.name} è morto/a di fame. 💀`,
      cat: 'drama',
      category: 'drama',
    });
    bus.emit('life:event', { simId: person.id, type: 'death', valence: -1 });
  }

  _illnessChance(person, sim) {
    const needs = sim?.needs?.getAll?.() ?? {};
    const hygienePressure = this._pressure(needs.hygiene);
    const energyPressure = this._pressure(needs.energy);
    const hungerPressure = this._pressure(needs.hunger);
    // Calibration constants live in cfg.health so the God/Admin page can retune
    // illness risk live (defaults match the 2026-06-25 calibration: ~51 rolls/day,
    // a well-kept Sim sick a few %/day, sustained neglect capped at ~0.02/cycle).
    const h = cfg.health ?? {};
    const weatherBoost = this._game._weather?.current === 'rain' ? (h.illnessWeather ?? 0.002) : 0;
    // Nutrition (M12): well-fed Sims resist illness; poor nutrition raises risk.
    const nutrition = sim?._nutrition ?? 0.6;
    const nutritionBoost = (1 - nutrition) * (h.illnessNutrition ?? 0.004);
    // Kitchen hygiene (WP8): a dirty kitchen breeds illness.
    const kh = this._game?.world?.kitchenHygiene ?? 100;
    const kitchenBoost = (100 - kh) / 100 * (h.illnessKitchen ?? 0.003);
    return Math.min(h.illnessCap ?? 0.02,
      (h.illnessBase ?? 0.0008)
      + hygienePressure * (h.illnessHygiene ?? 0.006)
      + energyPressure  * (h.illnessEnergy  ?? 0.004)
      + hungerPressure  * (h.illnessHunger  ?? 0.002)
      + nutritionBoost + kitchenBoost + weatherBoost);
  }

  _pressure(value = 50) {
    return Math.max(0, Math.min(1, (60 - Number(value ?? 50)) / 60));
  }

  _pickIllness(details = {}) {
    if (details.cause === 'offlot_incident') return 'injury';
    return ILLNESSES[Math.floor(Math.random() * ILLNESSES.length)]?.label ?? 'illness';
  }
}

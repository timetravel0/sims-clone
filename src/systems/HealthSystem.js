import { bus } from '../core/EventBus.js';
import { memorySystem } from './MemorySystem.js';

const ILLNESSES = [
  { id: 'cold', label: 'cold' },
  { id: 'flu', label: 'flu' },
  { id: 'fatigue', label: 'fatigue' },
  { id: 'food_poisoning', label: 'food poisoning' },
];

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
    const sim = this._game.sims?.find?.(s => s.id === person.id) ?? null;
    const health = person.health ?? { state: 'healthy', severity: 0 };
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
    const recoveryDelay = Math.round(120 + (health.severity ?? 0) * 180);
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
        text: `${person.name} came down with ${illness}.`,
        cat: 'drama',
        category: 'drama',
      });
    }
  }

  _illnessChance(person, sim) {
    const needs = sim?.needs?.getAll?.() ?? {};
    const hygienePressure = this._pressure(needs.hygiene);
    const energyPressure = this._pressure(needs.energy);
    const hungerPressure = this._pressure(needs.hunger);
    const weatherBoost = this._game._weather?.current === 'rain' ? 0.01 : 0;
    return Math.min(0.08, 0.005 + hygienePressure * 0.03 + energyPressure * 0.02 + hungerPressure * 0.01 + weatherBoost);
  }

  _pressure(value = 50) {
    return Math.max(0, Math.min(1, (60 - Number(value ?? 50)) / 60));
  }

  _pickIllness(details = {}) {
    if (details.cause === 'offlot_incident') return 'injury';
    return ILLNESSES[Math.floor(Math.random() * ILLNESSES.length)]?.label ?? 'illness';
  }
}

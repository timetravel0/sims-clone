import { bus } from '../core/EventBus.js';
import { ObjectRegistry } from './ObjectRegistry.js';

import { CAREERS } from '../config/careers.js';
export { CAREERS };

const CAREER_BY_ID = new Map(CAREERS.map(c => [c.id, c]));
const MAX_SKILL = 10;
const MAX_LEVEL = 10;
const SKILL_GAIN_PER_USE = 0.2;
const PROMOTION_PERFORMANCE = 100;

// Object→skill mapping lives in ObjectRegistry (single source of truth).

export class CareerSystem {
  constructor(sims = [], clock = null, game = null) {
    this._sims = sims;
    this._clock = clock;
    this._game = game;
    this._data = new Map();

    for (const sim of sims) this._initSim(sim);

    bus.on('life:event', payload => this._handleLifeEvent(payload));
    bus.on('sim:objectUsed', ({ sim, objectType }) => {
      if (sim && objectType) this.gainSkillFromObject(sim, objectType);
    });
    // Career boost: a global skill level-up in your career's field raises performance.
    bus.on('skill:levelUp', ({ sim, skill, level }) => this._onSkillLevelUp(sim, skill, level));
  }

  _onSkillLevelUp(sim, skill, level) {
    const state = sim && this._data.get(sim.id);
    if (!state || state.careerId === 'unemployed') return;
    const career = this._career(state.careerId);
    if (!career || !(skill in (career.skillReq ?? {}))) return;
    state.performance = Math.min(PROMOTION_PERFORMANCE, state.performance + 10);
    bus.emit('story:entry', {
      text: `${sim.name}'s ${skill} (Lv.${level}) boosted their ${career.label} performance.`,
      cat: 'positive', category: 'positive',
    });
    if (state.performance >= PROMOTION_PERFORMANCE && state.level < MAX_LEVEL) {
      this._promote(sim, 'skill');
    }
  }

  update(_dt) {
    this._ensureSims();
    const hour = Number(this._clock?.hour ?? 0);
    const weekday = Number(this._clock?.weekday ?? 0);

    for (const sim of this._sims) {
      const state = this._data.get(sim.id);
      const career = state ? this._career(state.careerId) : null;
      if (!state || !career || career.id === 'unemployed') {
        if (sim) sim._atWork = false;
        continue;
      }

      if (!state.atWork && this._shouldCallInSick(sim)) {
        const health = this._healthState(sim);
        if (state._sickNotifiedAt !== health?.startedAtTick) {
          state._sickNotifiedAt = health?.startedAtTick ?? (this._clock?.day ?? 0);
          bus.emit('career:callInSick', { sim, career, illness: health?.illness ?? null });
        }
        continue;
      }

      const inShift = this._isInShift(career, weekday, hour);
      if (inShift && !state.atWork) this._startShift(sim, state, career);
      if (!inShift && state.atWork) this._endShift(sim, state, career);
    }
  }

  assign(simId, careerId) {
    const sim = this._findSim(simId);
    if (!sim) return false;
    return this.setCareer(sim, careerId);
  }

  joinCareer(simId, careerId) {
    return this.assign(simId, careerId);
  }

  switchCareer(simId, careerId) {
    const sim = this._findSim(simId);
    if (!sim) return false;
    return this._setCareer(sim, careerId, { mode: 'switch' });
  }

  quit(simId) {
    const sim = this._findSim(simId);
    if (!sim) return false;
    const state = this._data.get(sim.id) ?? this._initSim(sim);
    const oldCareer = this._career(state.careerId);
    state.careerId = 'unemployed';
    state.level = 1;
    state.performance = 50;
    state.daysWorked = 0;
    state.atWork = false;
    sim._atWork = false;
    bus.emit('career:quit', { simId: sim.id, sim, career: oldCareer?.label ?? 'Unemployed' });
    bus.emit('career:changed', { sim, career: this._career('unemployed') });
    return true;
  }

  setCareer(sim, careerId) {
    return this._setCareer(sim, careerId, { mode: 'assign' });
  }

  _setCareer(sim, careerId, { mode = 'assign' } = {}) {
    const career = this._career(careerId);
    if (!sim || !career) return false;
    const state = this._data.get(sim.id) ?? this._initSim(sim);
    const previousCareer = this._career(state.careerId) ?? this._career('unemployed');
    const wasUnemployed = state.careerId === 'unemployed';

    // Entry into a career is open (like The Sims). Skill requirements gate
    // promotions/performance, not joining — see _performanceGain().
    state.careerId = career.id;
    state.level = 1;
    state.performance = 50;
    state.daysWorked = 0;
    state.atWork = false;
    sim._atWork = false;
    if (wasUnemployed || mode === 'assign') {
      bus.emit('career:assigned', { simId: sim.id, sim, careerId: career.id, previousCareerId: previousCareer?.id ?? null });
    } else {
      bus.emit('career:switched', { simId: sim.id, sim, fromCareer: previousCareer, toCareer: career });
    }
    bus.emit('career:changed', {
      sim,
      career,
      previousCareer,
      mode: wasUnemployed ? 'assigned' : mode === 'switch' ? 'switched' : 'changed',
    });
    return true;
  }

  getState(simId) {
    const state = this._data.get(simId);
    return state ? { ...state, skills: { ...state.skills } } : null;
  }

  getCareerData(sim) {
    return sim ? this.getState(sim.id) : null;
  }

  getInfo(simId) {
    const sim = this._findSim(simId);
    const state = this._data.get(simId);
    if (!sim || !state) return null;
    const career = this._career(state.careerId) ?? this._career('unemployed');
    return {
      careerId: state.careerId,
      career: {
        ...career,
        requiredSkill: career.skillReq ?? {},
        salaryPerDay: this._salaryFor(career, state.level),
      },
      level: state.level,
      performance: state.performance,
      daysWorked: state.daysWorked,
      simoleons: state.simoleons,
      atWork: state.atWork,
      skills: { ...state.skills },
    };
  }

  gainSkill(sim, skill, amount = SKILL_GAIN_PER_USE) {
    const state = this._data.get(sim.id) ?? this._initSim(sim);
    if (!(skill in state.skills)) state.skills[skill] = 0;
    const prev = state.skills[skill];
    const next = Math.min(MAX_SKILL, prev + amount);
    state.skills[skill] = next;
    bus.emit('career:skillGain', { sim, skill, value: next });
    return next;
  }

  gainSkillFromObject(sim, objectType) {
    const skill = ObjectRegistry.get(objectType)?.skill;
    if (!skill) return null;
    return this.gainSkill(sim, skill);
  }

  serialise() {
    const out = {};
    for (const [id, state] of this._data) {
      out[id] = { ...state, skills: { ...state.skills } };
    }
    return out;
  }

  restore(data = {}) {
    this._data.clear();
    this._ensureSims();
    for (const [id, saved] of Object.entries(data || {})) {
      const sim = this._findSim(id);
      const state = {
        careerId: saved.careerId ?? 'unemployed',
        level: saved.level ?? 1,
        performance: saved.performance ?? 50,
        daysWorked: saved.daysWorked ?? 0,
        simoleons: saved.simoleons ?? 0,
        atWork: saved.atWork ?? false,
        _shiftStarted: saved._shiftStarted ?? false,
        _sickNotifiedAt: saved._sickNotifiedAt ?? null,
        skills: this._defaultSkills(saved.skills),
      };
      this._data.set(id, state);
      if (sim) sim._atWork = state.atWork;
    }
  }

  _ensureSims() {
    for (const sim of this._sims) {
      if (!this._data.has(sim.id)) this._initSim(sim);
    }
  }

  _initSim(sim) {
    const state = {
      careerId: 'unemployed',
      level: 1,
      performance: 50,
      daysWorked: 0,
      simoleons: 0,
      atWork: false,
      _shiftStarted: false,
      _sickNotifiedAt: null,
      skills: this._defaultSkills(),
    };
    this._data.set(sim.id, state);
    sim._atWork = false;
    return state;
  }

  _defaultSkills(overrides = {}) {
    return {
      cooking: 0,
      logic: 0,
      creativity: 0,
      fitness: 0,
      charisma: 0,
      handiness: 0,
      ...overrides,
    };
  }

  _findSim(simId) {
    return this._sims.find(s => s.id === simId) ?? null;
  }

  _career(careerId) {
    return CAREER_BY_ID.get(careerId) ?? null;
  }

  _isInShift(career, weekday, hour) {
    return (career.shifts ?? []).some(shift => {
      if (shift.day !== weekday) return false;
      return shift.start < shift.end
        ? hour >= shift.start && hour < shift.end
        : hour >= shift.start || hour < shift.end;
    });
  }

  _startShift(sim, state) {
    if (this._shouldCallInSick(sim)) return;
    state.atWork = true;
    state._shiftStarted = true;
    sim._atWork = true;
    sim._offLotReason = 'work';
    bus.emit('career:atWork', { simId: sim.id, sim, careerId: state.careerId });
    bus.emit('story:entry', {
      text: `${sim.name} left for work as ${this._career(state.careerId)?.label ?? 'worker'}.`,
      cat: 'family', category: 'family',
    });
  }

  _endShift(sim, state, career) {
    state.atWork = false;
    sim._atWork = false;
    sim._offLotReason = null;
    if (!state._shiftStarted) return;
    state._shiftStarted = false;

    const salary = this._salaryFor(career, state.level);
    state.simoleons += salary;
    state.daysWorked += 1;
    state.performance = Math.min(PROMOTION_PERFORMANCE, state.performance + this._performanceGain(state, career));
    sim.needs?.restore?.('status', 12);

    bus.emit('career:salary', { simId: sim.id, sim, amount: salary });
    bus.emit('career:shiftEnd', { sim, career: career.label, salary });
    bus.emit('story:entry', {
      text: `${sim.name} finished a shift as ${career.label} and earned §${salary}.`,
      cat: 'positive',
      category: 'positive',
    });

    if (state.performance >= PROMOTION_PERFORMANCE && state.level < MAX_LEVEL) {
      this._promote(sim, 'performance');
    }
  }

  _performanceGain(state, career) {
    const requiredSkills = Object.entries(career.skillReq ?? {});
    if (requiredSkills.length === 0) return 8;
    const bonus = requiredSkills.reduce((sum, [skill, min]) => {
      return sum + Math.max(0, (state.skills[skill] ?? 0) - min) * 2;
    }, 0);
    return 8 + bonus;
  }

  _salaryFor(career, level) {
    if (!career) return 0;
    return career.salaryBase + Math.max(0, level - 1) * career.salaryPerLevel;
  }

  _promote(sim, source = 'system') {
    const state = this._data.get(sim.id);
    if (!state || state.careerId === 'unemployed' || state.level >= MAX_LEVEL) return false;
    const career = this._career(state.careerId);
    const oldLevel = state.level;
    state.level += 1;
    state.performance = 50;
    const salary = this._salaryFor(career, state.level);
    sim.needs?.restore?.('status', 20);
    bus.emit('career:promoted', { sim, career: career.label, oldLevel, newLevel: state.level, salary, source });
    bus.emit('career:levelUp', { simId: sim.id, careerId: state.careerId, newLevel: state.level });
    bus.emit('story:entry', {
      text: `${sim.name} was promoted to ${career.label} Lv.${state.level}.`,
      cat: 'positive',
      category: 'positive',
    });
    return true;
  }

  _fire(sim) {
    const state = this._data.get(sim.id);
    if (!state || state.careerId === 'unemployed') return false;
    const career = this._career(state.careerId);
    state.careerId = 'unemployed';
    state.level = 1;
    state.performance = 50;
    state.daysWorked = 0;
    state.atWork = false;
    sim._atWork = false;
    sim.needs?.decay?.('status', 20);
    bus.emit('career:fired', { sim, career: career.label });
    bus.emit('career:changed', { sim, career: this._career('unemployed') });
    bus.emit('story:entry', {
      text: `${sim.name} was fired from ${career.label}.`,
      cat: 'drama',
      category: 'drama',
    });
    return true;
  }

  _handleLifeEvent(payload = {}) {
    const sim = payload.sim ?? this._findSim(payload.simId);
    if (!sim) return;
    if (payload.type === 'elder' && Math.random() < 0.08) this._fire(sim);
  }

  _shouldCallInSick(sim) {
    const health = this._healthState(sim);
    return health?.stage === 'sick' && (health.severity ?? 0) > 0.5;
  }

  _healthState(sim) {
    return this._game?.healthSystem?.getState?.(sim.id) ?? null;
  }
}

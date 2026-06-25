import * as THREE from 'three';
import cfg from '../config/gameConfig.js';
import { World } from '../world/World.js';

// The headless harness keeps its documented invariant of 1 tick = 1 game-minute
// (20 sub-steps × 0.05 == 1.0 scaled ÷ 1440 = one game-minute). The live game now
// defaults the day to 86400s (real-time at 1×); pin it back to 1440 here so
// headless clock progression — and every cadence derived from it — is unchanged.
cfg.time = { ...(cfg.time ?? {}), dayDurationSec: 1440 };
import { Sim } from '../entities/Sim.js';
import { bus } from '../core/EventBus.js';
import { memorySystem } from '../systems/MemorySystem.js';
import { NarrativePlanner } from '../systems/NarrativePlanner.js';
import { RelationshipGraph } from '../systems/RelationshipGraph.js';
import { SocialDynamicsSystem } from '../systems/SocialDynamicsSystem.js';
import { PopulationSystem } from '../systems/PopulationSystem.js';
import { VisitorSystem } from '../systems/VisitorSystem.js';
import { OffLotSimulationSystem } from '../systems/OffLotSimulationSystem.js';
import { AutonomousShoppingSystem } from '../systems/AutonomousShoppingSystem.js';
import { RomanceSystem } from '../systems/RomanceSystem.js';
import { ExperimentLogger } from '../systems/ExperimentLogger.js';
import { AgeSystem } from '../systems/AgeSystem.js';
import { CareerSystem } from '../systems/CareerSystem.js';
import { ScheduleSystem } from '../systems/ScheduleSystem.js';
import { PartySystem } from '../systems/PartySystem.js';
import { HealthSystem } from '../systems/HealthSystem.js';
import { skillSystem } from '../systems/SkillSystem.js';
import { weatherSystem } from '../systems/WeatherSystem.js';
import { moodEngine } from '../systems/MoodEngine.js';
import { budgetSystem } from '../systems/BudgetSystem.js';
import { DayNightCycle } from '../world/DayNightCycle.js';
import { WallManager } from '../world/WallManager.js';
import { RoomDetector } from '../world/RoomDetector.js';
import { SIM_DEFS, STARTER_CAREERS } from '../config/defaultPopulation.js';
import { ObjectRegistry } from '../systems/ObjectRegistry.js';
import { GameContext }    from '../core/GameContext.js';
import { LayoutPlanner }  from '../world/LayoutPlanner.js';
import { AutonomousConstructionSystem } from '../systems/AutonomousConstructionSystem.js';
import { describeLocation } from '../systems/LocationService.js';
import { DoctorService }    from '../systems/DoctorService.js';
import { HouseholdPlanner } from '../systems/HouseholdPlanner.js';

// Fidelity: the browser advances on a fixed 20 Hz timestep (GameLoop TICK_MS),
// i.e. dt=0.05s per frame. Movement (step = SPEED·dt), path-block timers and the
// brain's decision cadence all depend on that small dt. Driving the headless loop
// with a single dt=1 step per game-minute teleported Sims ~3.5 cells/step, which
// made co-location (and therefore social interaction counts) an artifact. We now
// sub-step each game-minute into SUBSTEPS browser-sized frames so behaviour
// matches the browser; linear per-dt integrations (needs, drift, cooldowns) are
// unaffected since 20×0.05 == 1.0.
const SUBSTEP_DT = 0.05;             // seconds; mirrors GameLoop 20 Hz fixed step
const SUBSTEPS   = Math.round(1 / SUBSTEP_DT);  // 20 frames == 1 game-minute at 1×

const HEADLESS_METRIC_EVENTS = [
  'skill:levelUp',
  'career:promoted',
  'career:switched',
  'career:salary',
  'career:shiftEnd',
  'career:burnout',
  'career:callInSick',
  'food:cooked',
  'food:eaten',
  'food:poisoning',
  'household:roomCreated',
  'household:plan',
  'health:treated',
  'story:entry',
  'household:crafted',
];

function ensureHeadlessGlobals(game) {
  globalThis.window ??= {};
  globalThis.window._game = game;
  globalThis._game = game;
  globalThis.document ??= { getElementById: () => null };
}

export class HeadlessRuntime {
  constructor({ household = SIM_DEFS, speed = 1, seed = null } = {}) {
    this.seed = seed;
    this.clock = { hour: 8, speed, paused: false, day: 0, weekday: 0 };
    this.tick = 0;
    this.sims = [];
    this.selectedSim = null;
    this.relationshipSnapshots = [];
    this.buildMode = { active: false };
    this.objectRegistry = ObjectRegistry;
    this.budgetSystem = budgetSystem;
    // budgetSystem is a module singleton; without this each headless run would
    // inherit the previous run's depleted balance and stop buying after ~4 runs.
    this.budgetSystem.reset();
    this._unsubscribers = [];
    ensureHeadlessGlobals(this);
    GameContext.set(this);

    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0x1a1814);
    this._scene.fog = new THREE.Fog(0x1a1814, 60, 120);

    this.world = new World(this._scene);
    this.dayNight = new DayNightCycle(this._scene);
    this.wallManager = new WallManager(this._scene, this.world.tilemap);
    this.world.wallManager = this.wallManager;
    this.roomDetector = new RoomDetector(this.world.tilemap, this.wallManager);

    for (const def of household) {
      const sim = new Sim(this._scene, this.world, bus, def.name, def.color, def.traits || {}, def.id ?? null, def.gender ?? null);
      const pos = this.world.randomAvailableCell(sim);
      if (pos) sim.setPosition(pos.x, pos.z);
      this.sims.push(sim);
    }
    this.selectedSim = this.sims[0] ?? null;

    this._narrative = new NarrativePlanner(this.sims);
    this.experimentLogger = new ExperimentLogger(this);
    this._registerMetricEvents();
    this.memorySystem = memorySystem;
    this.relationshipGraph = new RelationshipGraph(this.sims);
    this.socialDynamics = new SocialDynamicsSystem(this.sims);
    this.ageSystem = new AgeSystem(this.sims);
    this.careerSystem = new CareerSystem(this.sims, this.clock, this);
    this.scheduleSystem = new ScheduleSystem(this.sims, this.clock);
    this.sims.forEach((s, i) => this.careerSystem.assign(s.id, STARTER_CAREERS[i % STARTER_CAREERS.length]));
    this.partySystem = new PartySystem(this);
    this.population = new PopulationSystem(this, this.sims);
    this.romanceSystem = new RomanceSystem(this.sims, this.relationshipGraph, this.population);
    this.relationshipGraph.setPopulation?.(this.population);
    this.healthSystem = new HealthSystem(this);
    this.doctor = new DoctorService(this);
    this.visitorSystem = new VisitorSystem(this);
    this.offLotSimulation = new OffLotSimulationSystem(this);
    this.autonomousShopping = new AutonomousShoppingSystem(this);
    this.layoutPlanner      = new LayoutPlanner(this.world);
    this.construction       = new AutonomousConstructionSystem(this);
    this.householdPlanner   = new HouseholdPlanner(this);
    this._weather = weatherSystem;
    this._moodEngine = moodEngine;

    for (const sim of this.sims) skillSystem.register(sim);
  }

  run({ ticks = 2000, snapshotEvery = 100 } = {}) {
    // `ticks` counts game-minutes (external semantics unchanged). Each is advanced
    // through SUBSTEPS browser-sized frames so movement/brain behave faithfully.
    this._locationTime = {};
    for (let i = 0; i < ticks; i++) {
      this.tick += 1;
      for (let s = 0; s < SUBSTEPS; s++) this.update(SUBSTEP_DT);
      for (const sim of this.sims) {
        if (sim._isVisitor) continue;
        const mode = describeLocation(sim, { roomDetector: this.roomDetector, world: this.world }).mode;
        this._locationTime[mode] = (this._locationTime[mode] ?? 0) + 1;
      }
      if (snapshotEvery > 0 && this.tick % snapshotEvery === 0) this.relationshipSnapshots.push(this.relationshipSnapshot());
    }
    return this.summary();
  }

  update(dt = SUBSTEP_DT) {
    if (this.clock.paused) return;
    const scaled = dt * this.clock.speed;

    this.dayNight.update(scaled);
    this.clock.hour = this.dayNight.time * 24;
    this.clock.weekday = Math.floor(this.dayNight.totalDays ?? 0) % 7;
    const newDay = Math.floor(this.dayNight.totalDays ?? 0);
    if (newDay > this.clock.day) { this.clock.day = newDay; bus.emit('clock:dayChanged', { day: newDay }); }
    else this.clock.day = newDay;

    for (const sim of this.sims) {
      if (sim._atWork || sim._outing) {
        if (sim.mesh.visible) this._sendOffLot(sim);
        continue;
      }
      if (!sim.mesh.visible) this._returnOnLot(sim);
      sim.update(scaled);
    }

    memorySystem.update(scaled);
    this.experimentLogger.update(scaled);
    this._narrative.update(scaled);
    this.world.update(scaled);
    this.ageSystem.update(scaled);
    this.healthSystem?.update?.(scaled);
    this.doctor?.update?.();
    this.careerSystem.update(scaled);
    this.scheduleSystem.update(scaled);
    this.partySystem.update(scaled);
    this.socialDynamics.update(scaled);
    this.population.update?.(scaled);
    this.offLotSimulation.update(scaled);
    this.visitorSystem.update(scaled);
    this.autonomousShopping.update(scaled);
    this.layoutPlanner.update(scaled);

    this._weather.update(scaled);
    const deltas = this._weather.getMoodDeltas();
    for (const sim of this.sims) {
      if (sim._atWork || sim._outing) continue;
      for (const [need, delta] of Object.entries(deltas)) sim.needs?.delta?.(need, delta * scaled);
      const roomBonus = this.roomDetector?.moodBonusAt(sim.gx, sim.gz) ?? 0;
      if (roomBonus) sim.needs?.delta?.('room', roomBonus * scaled * 0.5);
      sim._mood = this._moodEngine.compute(sim);
      sim._moodLabel = this._moodEngine.getMoodLabel(sim);
    }
    skillSystem.update(scaled / 86400);
  }

  createCustomObject(def) { return this.objectRegistry?.registerCustom?.(def); }

  _spawnSim(def, gx, gz) {
    const sim = new Sim(this._scene, this.world, bus, def.name, def.color, def.traits || {}, def.id ?? null, def.gender ?? null);
    sim._isVisitor = !!def.visitor;
    const pos = (gx != null && gz != null) ? { x: gx, z: gz } : this.world.randomAvailableCell(sim);
    if (pos) sim.setPosition(pos.x, pos.z);
    this.sims.push(sim);
    skillSystem.register(sim);
    bus.emit('sim:spawned', { sim, visitor: sim._isVisitor });
    return sim;
  }

  _despawnSim(sim) {
    const i = this.sims.indexOf(sim);
    if (i < 0) return;
    this.sims.splice(i, 1);
    this._scene.remove(sim.mesh);
    this.world.releaseCellFor(sim.id);
    bus.emit('sim:despawned', { simId: sim.id });
  }

  _sendOffLot(sim) {
    sim.mesh.visible = false;
    sim._path = [];
    sim.isMoving = false;
    sim.brain?.override?.([]);
    this.world.releaseCellFor(sim.id);
    sim.showBubble?.('', 0);
  }

  _returnOnLot(sim) { sim.mesh.visible = true; }

  relationshipSnapshot() {
    const people = this.population?.allPeople?.() ?? this.sims;
    const rows = [];
    for (const a of people) for (const b of people) {
      if (!a?.id || !b?.id || a.id === b.id) continue;
      rows.push({ tick: this.tick, fromId: a.id, toId: b.id, affinity: Math.round(this.socialDynamics.affinity(a.id, b.id)), dims: this.socialDynamics.snapshot(a.id, b.id) });
    }
    return { tick: this.tick, rows };
  }

  summary() {
    const events = this.experimentLogger.events ?? [];
    const social = events.filter(e => e.type === 'social:interaction');
    const visits = events.filter(e => e.type === 'visitor:visitEnded');
    const negative = social.filter(e => ['argue', 'insult', 'confront', 'avoid', 'reject_flirt'].includes(e.interactionType)).length;
    const acceptedVisits = visits.filter(e => e.accepted || e.outcome === 'accepted').length;
    const household = this.sims.filter(s => !s._isVisitor);
    const avgSkillTotal = household.length ? +(household.reduce((sum, sim) => sum + Object.values(skillSystem.getSkills(sim)).reduce((a, b) => a + b, 0), 0) / household.length).toFixed(2) : 0;
    const affinities = this.relationshipSnapshot().rows.map(r => r.affinity);
    const finalMeanAffinity = affinities.length ? +(affinities.reduce((a, b) => a + b, 0) / affinities.length).toFixed(2) : 0;
    const negativeRelationshipRate = affinities.length ? +(affinities.filter(v => v < -50).length / affinities.length).toFixed(3) : 0;
    const activeCareers = household.filter(p => this.careerSystem.getState(p.id)?.careerId !== 'unemployed').length;
    const romanceEdges = this.relationshipGraph.strongest('romance', 25).length;
    const promotionEvents = events.filter(e => e.type === 'career:promoted').length;
    const careerSwitchEvents = events.filter(e => e.type === 'career:switched').length;
    const burnoutEvents = events.filter(e => e.type === 'career:burnout').length;
    const sickEvents = events.filter(e => e.type === 'career:callInSick').length;
    const stresses = household.map(p => this.careerSystem.getState(p.id)?.stress ?? 0);
    const avgWorkStress = stresses.length ? +(stresses.reduce((a, b) => a + b, 0) / stresses.length).toFixed(1) : 0;
    const cookedEvents = events.filter(e => e.type === 'food:cooked');
    const mealsCooked = cookedEvents.length;
    const poorMeals = cookedEvents.filter(e => e.quality === 'poor').length;
    const totalServings = events.filter(e => e.type === 'food:eaten').reduce((a, e) => a + (e.servings ?? 1), 0);
    const QSCORE = { poor: 0.25, normal: 0.55, good: 0.8, excellent: 1.0 };
    const avgFoodQuality = mealsCooked
      ? +(cookedEvents.reduce((a, e) => a + (QSCORE[e.quality] ?? 0), 0) / mealsCooked).toFixed(3) : 0;
    const foodPoisonings = events.filter(e => e.type === 'food:poisoning').length;
    const roomsBuilt = events.filter(e => e.type === 'household:roomCreated').length;
    const planEvents = events.filter(e => e.type === 'household:plan');
    const householdPlans = planEvents.length;
    const planByType = planEvents.reduce((m, e) => {
      const k = e.intervention ?? 'unknown';
      m[k] = (m[k] ?? 0) + 1; return m;
    }, {});
    const treatedEvents = events.filter(e => e.type === 'health:treated');
    const treatments = treatedEvents.length;
    const treatmentSpend = treatedEvents.reduce((a, e) => a + (e.cost ?? 0), 0);
    const locTotal = Object.values(this._locationTime ?? {}).reduce((a, b) => a + b, 0) || 1;
    const locationTime = Object.fromEntries(
      Object.entries(this._locationTime ?? {}).map(([k, v]) => [k, +(v / locTotal).toFixed(3)]));
    const craftedEvents = events.filter(e => e.type === 'household:crafted').length;
    const levelUpEvents = events.filter(e => e.type === 'skill:levelUp').length;
    const sparkEvents = events.filter(e => e.type === 'story:entry' && /romantic spark/i.test(String(e.text ?? ''))).length;
    return {
      seed: this.seed,
      ticks: this.tick,
      events: events.length,
      socialInteractions: social.length,
      conflictRate: social.length ? +(negative / social.length).toFixed(3) : 0,
      finalMeanAffinity,
      negativeRelationshipRate,
      totalVisits: visits.length,
      visitAcceptanceRate: visits.length ? +(acceptedVisits / visits.length).toFixed(3) : 0,
      promotions: promotionEvents,
      careerSwitches: careerSwitchEvents,
      careerBurnouts: burnoutEvents,
      callInSick: sickEvents,
      avgWorkStress,
      mealsCooked,
      poorMeals,
      mealServings: totalServings,
      avgFoodQuality,
      foodPoisonings,
      kitchenHygiene: Math.round(this.world?.kitchenHygiene ?? 100),
      roomsBuilt,
      householdPlans,
      planByType,
      treatments,
      treatmentSpend,
      locationTime,
      crafted: craftedEvents,
      careerActiveRate: household.length ? +(activeCareers / household.length).toFixed(3) : 0,
      skillLevelUps: levelUpEvents,
      avgSkillTotal,
      romanceSparks: sparkEvents,
      romanceActivationRate: social.length ? +(romanceEdges / social.length).toFixed(4) : 0,
      relationshipSnapshots: this.relationshipSnapshots.length,
    };
  }

  dispose() {
    for (const off of this._unsubscribers) off?.();
    this._unsubscribers = [];
    this.experimentLogger?.dispose?.();
    this.doctor?.dispose?.();
    this.householdPlanner?.dispose?.();
    for (const sim of this.sims) {
      sim.brain?.destroy?.();
      this.world?.releaseCellFor?.(sim.id);
      this._scene?.remove?.(sim.mesh);
    }
    if ((globalThis.window?._game) === this) globalThis.window._game = null;
    if (globalThis._game === this) globalThis._game = null;
    if (GameContext.game === this) GameContext.reset();
    bus.clear();  // remove all child-system listeners registered during this run
  }

  _isHHPayload(p) {
    const ids = [p?.simId, p?.personId, p?.sim?.id, p?.simA?.id, p?.simB?.id, p?.idA, p?.idB].filter(Boolean);
    if (!ids.length) return true;
    return ids.some(id => this.population?.isHouseholdMember?.(id));
  }

  _registerMetricEvents() {
    this._unsubscribers.push(...HEADLESS_METRIC_EVENTS.map(type =>
      bus.on(type, payload => { if (this._isHHPayload(payload)) this.experimentLogger.record(type, payload); })
    ));
  }

  get events() { return this.experimentLogger.events ?? []; }
}

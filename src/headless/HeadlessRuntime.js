import * as THREE from 'three';
import { World } from '../world/World.js';
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
    ensureHeadlessGlobals(this);

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
    this.visitorSystem = new VisitorSystem(this);
    this.offLotSimulation = new OffLotSimulationSystem(this);
    this.autonomousShopping = new AutonomousShoppingSystem(this);
    this._weather = weatherSystem;
    this._moodEngine = moodEngine;

    for (const sim of this.sims) skillSystem.register(sim);
  }

  run({ ticks = 2000, dt = 1, snapshotEvery = 100 } = {}) {
    for (let i = 0; i < ticks; i++) {
      this.update(dt);
      if (snapshotEvery > 0 && this.tick % snapshotEvery === 0) this.relationshipSnapshots.push(this.relationshipSnapshot());
    }
    return this.summary();
  }

  update(dt) {
    if (this.clock.paused) return;
    const scaled = dt * this.clock.speed;

    this.dayNight.update(scaled);
    this.clock.hour = this.dayNight.time * 24;
    this.clock.weekday = Math.floor(this.dayNight.totalDays ?? 0) % 7;
    this.clock.day = Math.floor(this.dayNight.totalDays ?? 0);
    this.tick += 1;

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
    this.careerSystem.update(scaled);
    this.scheduleSystem.update(scaled);
    this.partySystem.update(scaled);
    this.socialDynamics.update(scaled);
    this.population.update?.(scaled);
    this.offLotSimulation.update(scaled);
    this.visitorSystem.update(scaled);
    this.autonomousShopping.update(scaled);

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
      promotions: events.filter(e => e.type === 'career:promoted').length,
      careerActiveRate: household.length ? +(activeCareers / household.length).toFixed(3) : 0,
      skillLevelUps: events.filter(e => e.type === 'skill:levelUp').length,
      avgSkillTotal,
      romanceSparks: events.filter(e => e.type === 'story:entry' && /romantic spark/i.test(String(e.text ?? ''))).length,
      romanceActivationRate: social.length ? +(romanceEdges / social.length).toFixed(4) : 0,
      relationshipSnapshots: this.relationshipSnapshots.length,
    };
  }

  get events() { return this.experimentLogger.events ?? []; }
}

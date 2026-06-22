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
  constructor({ household = SIM_DEFS, speed = 1 } = {}) {
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
}

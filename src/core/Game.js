import * as THREE              from 'three';
import { World }               from '../world/World.js';
import { Sim }                 from '../entities/Sim.js';
import { UIManager }           from '../ui/UIManager.js';
import { IsometricCamera }     from '../world/IsometricCamera.js';
import { BuildMode }           from '../world/BuildMode.js';
import { DayNightCycle }       from '../world/DayNightCycle.js';
import { GameLoop }            from './GameLoop.js';
import { bus }                 from './EventBus.js';
import { memorySystem }        from '../systems/MemorySystem.js';
import { NarrativePlanner }    from '../systems/NarrativePlanner.js';
import { SaveLoad }            from '../systems/SaveLoad.js';
import { socialManager }       from '../systems/SocialManager.js';
import { ContextMenu }         from '../ui/ContextMenu.js';
import { GodPanel }            from '../ui/GodPanel.js';
import { GraphPanel }          from '../ui/GraphPanel.js';
import { WalkToAction }        from '../ai/Action.js';
import { GodMode }             from '../systems/GodMode.js';
import { RelationshipGraph }   from '../systems/RelationshipGraph.js';
import { RomanceSystem }       from '../systems/RomanceSystem.js';
import { ExperimentLogger }    from '../systems/ExperimentLogger.js';

const SIM_DEFS = [
  { name: 'Alice', color: 0x4fc3f7, traits: { outgoing: 0.7, playful: 0.5, nice: 0.6 } },
  { name: 'Bob',   color: 0xef9a9a, traits: { neurotic: 0.6, ambitious: 0.8 } },
  { name: 'Cleo',  color: 0xa5d6a7, traits: { nice: 0.9, outgoing: -0.3 } },
];

export class Game {
  constructor(container) {
    this._container  = container;
    this.sims        = [];
    this.selectedSim = null;
    this.clock       = { hour: 8, speed: 1, paused: false };
    this._init();
  }

  _init() {
    // Renderer
    this._renderer = new THREE.WebGLRenderer({ antialias: true });
    this._renderer.setPixelRatio(window.devicePixelRatio);
    this._renderer.setSize(window.innerWidth, window.innerHeight);
    this._renderer.shadowMap.enabled = true;
    this._container.appendChild(this._renderer.domElement);

    // Scene & lights
    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0x1a1814);
    this._scene.fog = new THREE.Fog(0x1a1814, 60, 120);
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    const dir     = new THREE.DirectionalLight(0xffd580, 1.0);
    dir.position.set(10, 20, 10);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    this._scene.add(ambient, dir);

    // World
    this.world = new World(this._scene);

    // Camera
    this._camera = new IsometricCamera(window.innerWidth / window.innerHeight);
    this.camera = this._camera;
    this._camera.focusOn(8, 8);
    this.dayNight = new DayNightCycle(this._scene);

    // Sims
    for (const def of SIM_DEFS) {
      const sim = new Sim(this._scene, this.world, bus, def.name, def.color, def.traits || {});
      const pos = this.world.randomAvailableCell(sim);
      if (pos) sim.setPosition(pos.x, pos.z);
      this.sims.push(sim);
    }
    this.selectedSim = this.sims[0];
    this.selectedSim.setSelected(true);

    // Systems — Sprint 1
    this._narrative = new NarrativePlanner(this.sims);
    this.experimentLogger = new ExperimentLogger(this);
    this.relationshipGraph = new RelationshipGraph(this.sims);
    this.romanceSystem = new RomanceSystem(this.sims, this.relationshipGraph);
    this._saveLoad = new SaveLoad(this);
    this.godMode = new GodMode(this);
    this.buildMode = new BuildMode(this.world, this._scene, this._renderer, this._camera);
    this._contextMenu = new ContextMenu(this, this._renderer);

    // Expose globally for UI panels
    window._game = this;

    // UI
    this._ui = new UIManager(this.sims, this.selectedSim, bus);
    this._godPanel = new GodPanel(this);
    this._graphPanel = new GraphPanel(this);
    bus.emit('sim:selected', { sim: this.selectedSim });

    // Input
    this._setupInput();

    // Game loop
    this._loop = new GameLoop({
      onUpdate: dt => this._update(dt),
      onRender: () => this._render(),
    });
    this._loop.start();

    // Resize
    window.addEventListener('resize', () => {
      this._renderer.setSize(window.innerWidth, window.innerHeight);
      this._camera.onResize(window.innerWidth / window.innerHeight);
    });
  }

  _update(dt) {
    if (this.clock.paused) return;
    const scaled = dt * this.clock.speed;

    this.dayNight.update(scaled);
    this.clock.hour = this.dayNight.time * 24;

    // Update all sims
    for (const sim of this.sims) sim.update(scaled);

    // Systems
    memorySystem.update(scaled);         // decay memories
    this.experimentLogger.update(scaled);
    this._narrative.update(scaled);      // story beats
    this.world.update(scaled);
  }

  _render() {
    this._renderer.render(this._scene, this._camera.camera);
  }

  _setupInput() {
    const canvas = this._renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const mouse     = new THREE.Vector2();

    canvas.addEventListener('click', (e) => {
      if (e.button !== 0) return;
      if (this.buildMode?.active) {
        this.buildMode.handleClick(e);
        return;
      }
      mouse.set(
        (e.clientX / window.innerWidth)  * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );
      raycaster.setFromCamera(mouse, this._camera.camera);
      // Try Sim selection first
      const simMeshes = this.sims.map(s => s.mesh);
      const simHits   = raycaster.intersectObjects(simMeshes, true);
      if (simHits.length > 0) {
        const hit = simHits[0].object;
        const sim = this.sims.find(s => s.mesh === hit || s.mesh.children.includes(hit));
        if (sim) { this._selectSim(sim); return; }
      }
      // Ground click → move selected sim
      const groundHits = raycaster.intersectObjects(this.world.groundMeshes);
      if (groundHits.length > 0 && this.selectedSim) {
        const { gridX, gridZ } = groundHits[0].object.userData;
        this.selectedSim.brain.override([new WalkToAction(this.selectedSim, this.world, gridX, gridZ)]);
      }
    });

    // Toolbar buttons
    this._bindToolbar();
  }

  _selectSim(sim) {
    for (const s of this.sims) s.setSelected(false);
    sim.setSelected(true);
    this.selectedSim = sim;
    bus.emit('sim:selected', { sim });
  }

  selectSimByIndex(index) {
    const sim = this.sims[index];
    if (sim) this._selectSim(sim);
  }

  togglePause() {
    this.clock.paused = !this.clock.paused;
    return this.clock.paused;
  }

  setSpeed(speed) {
    this.clock.speed = speed;
  }

  start() {
    if (!this._loop?._running) this._loop?.start();
  }

  _bindToolbar() {
    const q = id => document.getElementById(id);
    q('btn-pause')?.addEventListener('click', () => {
      const paused = this.togglePause();
      q('btn-pause').textContent = paused ? '▶ Resume' : '⏸ Pause';
    });
    ['1','2','5'].forEach(v => {
      q(`btn-${v}x`)?.addEventListener('click', () => {
        this.setSpeed(+v);
        ['1','2','5'].forEach(x => q(`btn-${x}x`)?.classList.remove('active'));
        q(`btn-${v}x`)?.classList.add('active');
        q('speed-label').textContent = `Speed: ${v}×`;
      });
    });
    q('btn-rel')?.addEventListener('click', () => {
      const el = q('rel-panel');
      if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
      q('btn-rel')?.classList.toggle('active');
    });
    q('btn-save')?.addEventListener('click', () => this._saveLoad?.save());
    q('btn-load')?.addEventListener('click', () => this._saveLoad?.load());
  }

  serialise() {
    return {
      clock:   this.clock,
      dayNight: { time: this.dayNight?.time ?? this.clock.hour / 24 },
      sims:    this.sims.map(s => s.serialise()),
      memories: memorySystem.serialise(),
      social:  socialManager.serialise(),
      relationshipGraph: this.relationshipGraph.serialise(),
      romance: this.romanceSystem.serialise(),
      experimentLog: this.experimentLogger.serialise(),
    };
  }

  restore(state) {
    if (!state) return;
    Object.assign(this.clock, state.clock);
    if (this.dayNight && state.dayNight?.time !== undefined) {
      this.dayNight.time = state.dayNight.time;
      this.dayNight.update(0);
      this.clock.hour = this.dayNight.time * 24;
    }
    for (const data of state.sims) {
      const sim = this.sims.find(s => s.id === data.id);
      if (sim) sim.restore(data);
    }
    if (state.memories) memorySystem.restore(state.memories);
    if (state.social) socialManager.restore(state.social);
    if (state.relationshipGraph) this.relationshipGraph.restore(state.relationshipGraph);
    if (state.romance) this.romanceSystem.restore(state.romance);
    if (state.experimentLog) this.experimentLogger.restore(state.experimentLog);
    bus.emit('sim:selected', { sim: this.selectedSim });
  }

  _save() {
    this._saveLoad?.save();
  }

  _load() {
    this._saveLoad?.load();
  }
}

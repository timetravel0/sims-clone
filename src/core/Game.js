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
import { LifeCyclePanel }      from '../ui/LifeCyclePanel.js';
import { LifecycleNotifier }   from '../ui/LifecycleNotifier.js';
// Sprint 4
import { skillSystem }         from '../systems/SkillSystem.js';
import { weatherSystem }       from '../systems/WeatherSystem.js';
import { moodEngine }          from '../systems/MoodEngine.js';
import { EmoteRenderer }       from '../systems/EmoteRenderer.js';
import { SkillPanel }          from '../ui/SkillPanel.js';

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
    // ── Renderer ──────────────────────────────────────────────────────────
    this._renderer = new THREE.WebGLRenderer({ antialias: true });
    this._renderer.setPixelRatio(window.devicePixelRatio);
    this._renderer.setSize(window.innerWidth, window.innerHeight);
    this._renderer.shadowMap.enabled = true;
    this._container.appendChild(this._renderer.domElement);

    // ── Scene & lights ────────────────────────────────────────────────────
    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0x1a1814);
    this._scene.fog = new THREE.Fog(0x1a1814, 60, 120);
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    const dir     = new THREE.DirectionalLight(0xffd580, 1.0);
    dir.position.set(10, 20, 10);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    this._scene.add(ambient, dir);
    // Keep ref to directional light for weather modulation
    this._dirLight = dir;

    // ── World ─────────────────────────────────────────────────────────────
    this.world = new World(this._scene);

    // ── Camera ────────────────────────────────────────────────────────────
    this._camera = new IsometricCamera(window.innerWidth / window.innerHeight);
    this.camera  = this._camera;
    this._camera.focusOn(8, 8);
    this.dayNight = new DayNightCycle(this._scene);

    // ── Sims ──────────────────────────────────────────────────────────────
    for (const def of SIM_DEFS) {
      const sim = new Sim(this._scene, this.world, bus, def.name, def.color, def.traits || {});
      const pos = this.world.randomAvailableCell(sim);
      if (pos) sim.setPosition(pos.x, pos.z);
      this.sims.push(sim);
    }
    this.selectedSim = this.sims[0];
    this.selectedSim.setSelected(true);

    // ── Systems — Sprint 1-3 ──────────────────────────────────────────────
    this._narrative      = new NarrativePlanner(this.sims);
    this.experimentLogger = new ExperimentLogger(this);
    this.relationshipGraph = new RelationshipGraph(this.sims);
    this.romanceSystem   = new RomanceSystem(this.sims, this.relationshipGraph);
    this._saveLoad       = new SaveLoad(this);
    this.godMode         = new GodMode(this);
    this.buildMode       = new BuildMode(this.world, this._scene, this._renderer, this._camera);
    this._contextMenu    = new ContextMenu(this, this._renderer);

    // ── Systems — Sprint 4 ────────────────────────────────────────────────
    for (const sim of this.sims) skillSystem.register(sim);
    this._weather       = weatherSystem;
    this._moodEngine    = moodEngine;

    // React to weather light updates
    bus.on('weather:lightUpdate', ({ light, intensity }) => {
      if (!light) return;
      this._dirLight.color.setHex(light.skyColor);
      this._dirLight.intensity = light.mult * intensity * 1.2 + 0.2;
    });

    // ── Expose globally for UI panels ─────────────────────────────────────
    window._game = this;

    // ── UI ────────────────────────────────────────────────────────────────
    this._ui         = new UIManager(this.sims, this.selectedSim, bus);
    this._godPanel   = new GodPanel(this);
    this._graphPanel = new GraphPanel(this);

    // Sprint 3 — lifecycle
    this._lifecyclePanel    = new LifeCyclePanel(this);
    this._lifecycleNotifier = new LifecycleNotifier('lifecycle-toast');

    // Sprint 4 — skill panel + emote renderer
    this._skillPanel    = new SkillPanel(this);
    this._emoteRenderer = new EmoteRenderer(this._scene, this.sims);

    bus.emit('sim:selected', { sim: this.selectedSim });

    // ── Input ─────────────────────────────────────────────────────────────
    this._setupInput();

    // ── Game loop ─────────────────────────────────────────────────────────
    this._loop = new GameLoop({
      onUpdate: dt => this._update(dt),
      onRender: () => this._render(),
    });
    this._loop.start();

    // ── Resize ────────────────────────────────────────────────────────────
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

    // Sims
    for (const sim of this.sims) sim.update(scaled);

    // Sprint 1-3 systems
    memorySystem.update(scaled);
    this.experimentLogger.update(scaled);
    this._narrative.update(scaled);
    this.world.update(scaled);
    this._lifecyclePanel?.update(scaled);

    // Sprint 4 systems
    this._weather.update(scaled);
    // Apply weather mood deltas to each sim
    const deltas = this._weather.getMoodDeltas();
    for (const sim of this.sims) {
      for (const [need, delta] of Object.entries(deltas)) {
        sim.needs?.delta?.(need, delta * scaled);
      }
      // Recompute mood score; stored on sim for external access
      sim._mood      = this._moodEngine.compute(sim);
      sim._moodLabel = this._moodEngine.getMoodLabel(sim);
    }
    // Skill decay (convert seconds → days: 1 day = 86400s sim-time)
    skillSystem.update(scaled / 86400);
    // Emote sprites
    this._emoteRenderer.update(scaled);
  }

  _render() {
    this._renderer.render(this._scene, this._camera.camera);
  }

  _setupInput() {
    const canvas    = this._renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const mouse     = new THREE.Vector2();

    canvas.addEventListener('click', (e) => {
      if (e.button !== 0) return;
      if (this.buildMode?.active) { this.buildMode.handleClick(e); return; }
      mouse.set(
        (e.clientX / window.innerWidth)  * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1,
      );
      raycaster.setFromCamera(mouse, this._camera.camera);
      // Sim selection
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

    this._bindToolbar();
  }

  _selectSim(sim) {
    for (const s of this.sims) s.setSelected(false);
    sim.setSelected(true);
    this.selectedSim = sim;
    bus.emit('sim:selected', { sim });
    if (this._lifecyclePanel?.isOpen()) this._lifecyclePanel.render();
  }

  selectSimByIndex(index) {
    const sim = this.sims[index];
    if (sim) this._selectSim(sim);
  }

  togglePause() {
    this.clock.paused = !this.clock.paused;
    return this.clock.paused;
  }

  setSpeed(speed) { this.clock.speed = speed; }

  start() { if (!this._loop?._running) this._loop?.start(); }

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

    // Sprint 3 — lifecycle panel
    const lcEl = q('lifecycle-panel');
    q('btn-lifecycle')?.addEventListener('click', () => {
      const opening = !lcEl || lcEl.style.display === 'none' || lcEl.style.display === '';
      if (lcEl) lcEl.style.display = opening ? 'block' : 'none';
      q('btn-lifecycle')?.classList.toggle('active', opening);
      if (opening) this._lifecyclePanel?.render();
    });

    // Sprint 4 — skill panel
    const skEl = q('skill-panel');
    q('btn-skills')?.addEventListener('click', () => {
      const opening = !skEl || skEl.style.display === 'none' || skEl.style.display === '';
      if (skEl) skEl.style.display = opening ? 'block' : 'none';
      q('btn-skills')?.classList.toggle('active', opening);
    });
  }

  serialise() {
    return {
      clock:    this.clock,
      dayNight: { time: this.dayNight?.time ?? this.clock.hour / 24 },
      sims:     this.sims.map(s => s.serialise()),
      memories: memorySystem.serialise(),
      social:   socialManager.serialise(),
      relationshipGraph: this.relationshipGraph.serialise(),
      romance:  this.romanceSystem.serialise(),
      experimentLog: this.experimentLogger.serialise(),
      lifecycle: this._lifecyclePanel?.serialise(),
      // Sprint 4
      weather:  this._weather.serialise(),
      skills:   skillSystem.serialise(),
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
    if (state.memories)           memorySystem.restore(state.memories);
    if (state.social)             socialManager.restore(state.social);
    if (state.relationshipGraph)  this.relationshipGraph.restore(state.relationshipGraph);
    if (state.romance)            this.romanceSystem.restore(state.romance);
    if (state.experimentLog)      this.experimentLogger.restore(state.experimentLog);
    if (state.lifecycle)          this._lifecyclePanel?.restore(state.lifecycle);
    // Sprint 4
    if (state.weather)            this._weather.restore(state.weather);
    if (state.skills)             skillSystem.restore(state.skills);
    bus.emit('sim:selected', { sim: this.selectedSim });
  }

  _save() { this._saveLoad?.save(); }
  _load() { this._saveLoad?.load(); }
}

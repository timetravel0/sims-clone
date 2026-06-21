import * as THREE              from 'three';
import { World }               from '../world/World.js';
import { Sim }                 from '../entities/Sim.js';
import { UIManager }           from '../ui/UIManager.js';
import { IsometricCamera }     from '../world/IsometricCamera.js';
import { BuildMode }           from '../world/BuildMode.js';
import { BuildModeWalls }      from '../world/BuildModeWalls.js';
import { WallManager }         from '../world/WallManager.js';
import { RoomDetector }        from '../world/RoomDetector.js';
import { budgetSystem }        from '../systems/BudgetSystem.js';
import { RoomOverlay }         from '../ui/RoomOverlay.js';
import { DayNightCycle }       from '../world/DayNightCycle.js';
import { GameLoop }            from './GameLoop.js';
import { bus }                 from './EventBus.js';
import { memorySystem }        from '../systems/MemorySystem.js';
import { NarrativePlanner }    from '../systems/NarrativePlanner.js';
import { SaveLoad }            from '../systems/SaveLoad.js';
import { SaveSlotPanel }       from '../ui/SaveSlotPanel.js';
import { SimCreator }          from '../ui/SimCreator.js';
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
import { AgeSystem }           from '../systems/AgeSystem.js';
import { CareerSystem }        from '../systems/CareerSystem.js';
import { ScheduleSystem }      from '../systems/ScheduleSystem.js';
import { PartySystem }         from '../systems/PartySystem.js';
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

// Map SimCreator string traits onto the 5 personality axes.
const TRAIT_AXIS = {
  Outgoing: { outgoing: 0.8 }, Shy: { outgoing: -0.7 }, Bookworm: { outgoing: -0.3 },
  Playful: { playful: 0.8 }, Active: { playful: 0.5 }, Serious: { playful: -0.5 },
  Nice: { nice: 0.8 }, Grouchy: { nice: -0.7 }, Romantic: { nice: 0.4 },
  Lazy: { ambitious: -0.6 }, Creative: { playful: 0.4 }, Logical: { neurotic: -0.3 },
};

function creatorDefToSimDef(def) {
  const traits = {};
  for (const t of def.traits ?? []) Object.assign(traits, TRAIT_AXIS[t] ?? {});
  const color = def.skintone ? parseInt(def.skintone.slice(1), 16) : 0x4fc3f7;
  return { name: def.name || 'Sim', color, traits };
}

export class Game {
  constructor(container) {
    this._container  = container;
    this.sims        = [];
    this.selectedSim = null;
    this.clock       = { hour: 8, speed: 1, paused: false };
    this._boot();
  }

  /**
   * Boot flow:
   *  - pending load (set by SaveLoad.load before a reload) → rebuild from that save
   *  - else, if any save slot exists → start menu (Load / New Game)
   *  - else → SimCreator (or default household if no UI anchor)
   */
  _boot() {
    const sl       = new SaveLoad(this);   // read-only use here (slotList/readSlot)
    const anchorEl = document.getElementById('sim-creator');

    const pending = sessionStorage.getItem('simsclone_pending_load');
    if (pending !== null) {
      sessionStorage.removeItem('simsclone_pending_load');
      const data = sl.readSlot(+pending);
      if (data) { this._startFromSave(data); return; }
    }

    if (!anchorEl) { this._init(SIM_DEFS); return; }

    const saves = sl.slotList().filter(s => !s.empty);
    if (saves.length === 0) { this._showCreator(); return; }
    this._showStartMenu(saves, sl);
  }

  _showCreator() {
    const creator = new SimCreator();
    creator.show();
    bus.on('simcreator:done', ({ householdName, simDefs }) => {
      this.householdName = householdName;
      const defs = (simDefs ?? []).map(creatorDefToSimDef);
      this._init(defs.length ? defs : SIM_DEFS);
    });
  }

  /** Start screen offering to load an existing save or begin a new game. */
  _showStartMenu(saves, sl) {
    const el = document.getElementById('start-menu');
    if (!el) { this._showCreator(); return; }   // fallback if HTML anchor missing
    const rows = saves.map(s => {
      const name = s.slot === 0 ? '🔄 Auto-Save' : `Slot ${s.slot}`;
      const when = s.timestamp ? new Date(s.timestamp).toLocaleString() : '';
      return `<button class="sm-load" data-slot="${s.slot}">
        <b>▶ ${name}</b> — ${s.householdName} · ${s.simCount} Sim${s.simCount !== 1 ? 's' : ''}
        <span class="sm-when">${when}</span></button>`;
    }).join('');
    el.innerHTML = `<div class="sm-modal">
      <h2>Sims Clone</h2>
      <button id="sm-new">🆕 Nuova partita</button>
      <div class="sm-loads">${rows}</div>
    </div>`;
    el.style.display = 'flex';
    el.querySelector('#sm-new').addEventListener('click', () => {
      el.style.display = 'none';
      this._showCreator();
    });
    el.querySelectorAll('.sm-load').forEach(b => b.addEventListener('click', () => {
      el.style.display = 'none';
      const data = sl.readSlot(+b.dataset.slot);
      if (data) this._startFromSave(data); else this._showCreator();
    }));
  }

  /** Build the game with the saved roster, then restore all state onto it. */
  _startFromSave(saveData) {
    this.householdName = saveData.householdName;
    const state = saveData.state ?? {};
    const defs = (state.sims ?? []).map(s => ({
      name: s.name, color: s.color, traits: s.personality ?? {},
    }));
    this._init(defs.length ? defs : SIM_DEFS);
    this.restore(state);
  }

  _init(simDefs = SIM_DEFS) {
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
    this.camera = this._camera;
    this._camera.focusOn(8, 8);
    this.dayNight = new DayNightCycle(this._scene);

    // ── Sims ──────────────────────────────────────────────────────────────
    for (const def of simDefs) {
      const sim = new Sim(this._scene, this.world, bus, def.name, def.color, def.traits || {});
      const pos = this.world.randomAvailableCell(sim);
      if (pos) sim.setPosition(pos.x, pos.z);
      this.sims.push(sim);
    }
    this.selectedSim = this.sims[0];
    this.selectedSim.setSelected(true);

    // ── Systems ────────────────────────────────────────────────────────────
    this._narrative      = new NarrativePlanner(this.sims);
    this.experimentLogger = new ExperimentLogger(this);
    this.relationshipGraph = new RelationshipGraph(this.sims);
    this.romanceSystem   = new RomanceSystem(this.sims, this.relationshipGraph);
    this._saveLoad       = new SaveLoad(this);
    this._saveSlotPanel  = new SaveSlotPanel(this._saveLoad, this.clock);
    this._saveLoad.startAutoSave(5);   // auto-save slot 0 every 5 min
    this.godMode         = new GodMode(this);
    this.buildMode       = new BuildMode(this.world, this._scene, this._renderer, this._camera);
    // ── Build: budget, walls, rooms ───────────────────────────────────────
    this.budgetSystem    = budgetSystem;
    this.wallManager     = new WallManager(this._scene, this.world.tilemap);
    this.world.wallManager = this.wallManager;   // reachable by Sim/Action pathfinding
    this.roomDetector    = new RoomDetector(this.world.tilemap, this.wallManager);
    this._buildWalls     = new BuildModeWalls(this.buildMode, this.wallManager, this._scene, this._renderer, this._camera, this.world);
    this._contextMenu    = new ContextMenu(this, this._renderer);
    this.ageSystem       = new AgeSystem(this.sims);
    this.careerSystem    = new CareerSystem(this.sims, this.clock);
    this.scheduleSystem  = new ScheduleSystem(this.sims, this.clock);
    // Give each Sim a starting career so the career world is alive from launch
    // (overwritten by save data on load). ponytail: round-robin over real careers.
    const STARTER_CAREERS = ['scientist', 'chef', 'artist', 'programmer', 'athlete'];
    this.sims.forEach((s, i) => this.careerSystem.assign(s.id, STARTER_CAREERS[i % STARTER_CAREERS.length]));
    this.partySystem     = new PartySystem(this);

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

    this._lifecyclePanel    = new LifeCyclePanel(this);
    this._lifecycleNotifier = new LifecycleNotifier('lifecycle-toast');
    this._skillPanel    = new SkillPanel(this);
    // BuildPanel is created by UIManager — don't duplicate it here.
    this._roomOverlay   = new RoomOverlay(this.roomDetector);
    this._emoteRenderer = new EmoteRenderer(this._scene, this.sims);

    bus.emit('sim:selected', { sim: this.selectedSim });

    // ── Input ─────────────────────────────────────────────────────────────
    this._setupInput();

    // ── Game loop ─────────────────────────────────────────────────────────
    // Game loop
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
    this.clock.weekday = Math.floor(this.dayNight.totalDays ?? 0) % 7;

    // Sims — those at work are hidden and frozen (off the lot)
    for (const sim of this.sims) {
      if (sim._atWork) {
        if (sim.mesh.visible) this._sendToWork(sim);
        continue;
      }
      if (!sim.mesh.visible) this._returnFromWork(sim);
      sim.update(scaled);
    }

    // Systems
    memorySystem.update(scaled);         // decay memories
    this.experimentLogger.update(scaled);
    this._narrative.update(scaled);      // story beats
    this.world.update(scaled);
    this.ageSystem.update(scaled);
    this.careerSystem.update(scaled);
    this.scheduleSystem.update(scaled);
    this.partySystem.update(scaled);

    // Sprint 4 systems
    this._weather.update(scaled);
    // Apply weather mood deltas to each sim
    const deltas = this._weather.getMoodDeltas();
    for (const sim of this.sims) {
      if (sim._atWork) continue;   // away at work — don't simulate needs/mood
      for (const [need, delta] of Object.entries(deltas)) {
        sim.needs?.delta?.(need, delta * scaled);
      }
      // Enclosed-room bonus feeds the 'room' need (ponytail: 0.5 = tuning knob)
      const roomBonus = this.roomDetector?.moodBonusAt(sim.gx, sim.gz) ?? 0;
      if (roomBonus) sim.needs?.delta?.('room', roomBonus * scaled * 0.5);
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
      if (this.buildMode?.active) { this._buildWalls.handleClick(e); return; }

      mouse.set(
        (e.clientX / window.innerWidth)  * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1,
      );
      raycaster.setFromCamera(mouse, this._camera.camera);
      // Sim selection (Sims at work are hidden and not selectable)
      const simMeshes = this.sims.filter(s => !s._atWork).map(s => s.mesh);
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
    // LifeCyclePanel re-renders itself on sim:selected (see its constructor).
  }

  /** Hide a Sim and halt its AI while it's away at work. */
  _sendToWork(sim) {
    sim.mesh.visible = false;
    sim._path = [];
    sim.isMoving = false;
    sim.brain?.override?.([]);            // drop current action
    this.world.releaseCellFor(sim.id);    // free its tile/reservation
    sim.showBubble?.('', 0);
  }

  /** Bring a Sim back onto the lot after work. */
  _returnFromWork(sim) {
    sim.mesh.visible = true;
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
    q('btn-save')?.addEventListener('click', () => this._saveSlotPanel?.open('save'));
    q('btn-load')?.addEventListener('click', () => this._saveSlotPanel?.open('load'));

    // Sprint 3 — lifecycle panel (LifeCyclePanel owns its visibility via toggle())
    q('btn-lifecycle')?.addEventListener('click', () => {
      this._lifecyclePanel?.toggle();
      q('btn-lifecycle')?.classList.toggle('active', !!this._lifecyclePanel?._visible);
    });

    // Sprint 4 — skill panel
    const skEl = q('skill-panel');
    q('btn-skills')?.addEventListener('click', () => {
      const opening = !skEl || skEl.style.display === 'none' || skEl.style.display === '';
      if (skEl) skEl.style.display = opening ? 'block' : 'none';
      q('btn-skills')?.classList.toggle('active', opening);
    });

    // Sprint 5/6 — build tools (furniture/wall/door/eraser), rooms overlay, funds
    document.querySelectorAll('#build-tools .bt-tool').forEach(b => {
      b.addEventListener('click', () => {
        this._buildWalls.setTool(b.dataset.tool);
        document.querySelectorAll('#build-tools .bt-tool')
          .forEach(x => x.classList.toggle('active', x === b));
      });
    });
    q('bt-rooms')?.addEventListener('click', () => {
      this.roomDetector.analyse();
      this._roomOverlay.toggle();
      q('bt-rooms')?.classList.toggle('active');
    });
    const fundsEl = q('bt-funds');
    const renderFunds = v => { if (fundsEl) fundsEl.textContent = '§' + Math.round(v).toLocaleString(); };
    renderFunds(this.budgetSystem.funds);
    bus.on('budget:changed', ({ next }) => renderFunds(next));

    // Party: host = selected Sim, guests = everyone else
    const partyBtn = q('btn-party');
    partyBtn?.addEventListener('click', () => {
      if (this.partySystem.active) return;   // one party at a time
      const host = this.selectedSim;
      const guests = this.sims.filter(s => s !== host);
      this.partySystem.start(host, guests);
    });
    bus.on('party:started', () => partyBtn?.classList.add('active'));
    bus.on('party:ended',   () => partyBtn?.classList.remove('active'));
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
      age: this.ageSystem.serialise(),
      career: this.careerSystem.serialise(),
      // Sprint 4
      weather:  this._weather.serialise(),
      skills:   skillSystem.serialise(),
      // Sprint 5/6 — build
      budget:   this.budgetSystem.serialise(),
      walls:    this.wallManager.serialise(),
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
    // Roster was rebuilt from state.sims in _startFromSave, so match by index
    // and adopt the saved id (subsystems below are keyed by Sim id).
    (state.sims ?? []).forEach((data, i) => {
      const sim = this.sims[i];
      if (sim) { sim.id = data.id; sim.restore(data); }
    });
    if (state.memories)           memorySystem.restore(state.memories);
    if (state.social)             socialManager.restore(state.social);
    if (state.relationshipGraph)  this.relationshipGraph.restore(state.relationshipGraph);
    if (state.romance)            this.romanceSystem.restore(state.romance);
    if (state.experimentLog)      this.experimentLogger.restore(state.experimentLog);
    if (state.age)                this.ageSystem.restore(state.age);
    if (state.career)             this.careerSystem.restore(state.career);
    // Sprint 4
    if (state.weather)            this._weather.restore(state.weather);
    if (state.skills)             skillSystem.restore(state.skills);
    // Sprint 5/6 — build
    if (state.budget)             this.budgetSystem.restore(state.budget);
    if (state.walls)            { this.wallManager.restore(state.walls); this.roomDetector.analyse(); }
    bus.emit('sim:selected', { sim: this.selectedSim });
  }

  _save() {
    this._saveLoad?.save();
  }

  _load() {
    this._saveLoad?.load();
  }

}

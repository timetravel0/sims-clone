import * as THREE              from 'three';
import { World }               from '../world/World.js';
import { Sim }                 from '../entities/Sim.js';
import { UIManager }           from '../ui/UIManager.js';
import { IsometricCamera }     from '../world/IsometricCamera.js';
import { GameLoop }            from './GameLoop.js';
import { bus }                 from './EventBus.js';
import { memorySystem }        from '../systems/MemorySystem.js';
import { NarrativePlanner }    from '../systems/NarrativePlanner.js';

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
    this._scene.fog = new THREE.Fog(0x1a1814, 20, 50);
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
    this._camera.focusOn(8, 8);

    // Sims
    for (const def of SIM_DEFS) {
      const sim = new Sim(this._scene, this.world, bus, def.name, def.color, def.traits || {});
      const pos = this.world.tilemap.randomWalkable();
      if (pos) sim.setPosition(pos.x, pos.z);
      this.sims.push(sim);
    }
    this.selectedSim = this.sims[0];
    bus.emit('sim:selected', { sim: this.selectedSim });

    // Systems — Sprint 1
    this._narrative = new NarrativePlanner(this.sims);

    // UI
    this._ui = new UIManager(this.sims, this.selectedSim, bus);

    // Input
    this._setupInput();

    // Game loop
    this._loop = new GameLoop(dt => this._update(dt), () => this._render());
    this._loop.start();

    // Resize
    window.addEventListener('resize', () => {
      this._renderer.setSize(window.innerWidth, window.innerHeight);
      this._camera.onResize(window.innerWidth / window.innerHeight);
    });

    // Expose globally for UI panels
    window._game = this;
  }

  _update(dt) {
    if (this.clock.paused) return;
    const scaled = dt * this.clock.speed;

    // Advance clock
    this.clock.hour = (this.clock.hour + scaled * (1/60)) % 24;
    bus.emit('daynight:update', { hour: this.clock.hour });

    // Update all sims
    for (const sim of this.sims) sim.update(scaled);

    // Systems
    memorySystem.update(scaled);         // decay memories
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
        this.selectedSim.brain.override([
          new (require('../ai/Action.js').WalkToAction)(this.selectedSim, this.world, gridX, gridZ)
        ]);
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

  _bindToolbar() {
    const q = id => document.getElementById(id);
    q('btn-pause')?.addEventListener('click', () => {
      this.clock.paused = !this.clock.paused;
      q('btn-pause').textContent = this.clock.paused ? '▶ Resume' : '⏸ Pause';
    });
    ['1','2','5'].forEach(v => {
      q(`btn-${v}x`)?.addEventListener('click', () => {
        this.clock.speed = +v;
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
    q('btn-build')?.addEventListener('click', () => {
      const el = q('build-panel');
      if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none';
      q('btn-build')?.classList.toggle('active');
    });
    q('btn-save')?.addEventListener('click', () => this._save());
    q('btn-load')?.addEventListener('click', () => this._load());
  }

  _save() {
    const state = {
      clock:   this.clock,
      sims:    this.sims.map(s => s.serialise()),
      memories: memorySystem.serialise(),
    };
    localStorage.setItem('simsSave', JSON.stringify(state));
    bus.emit('story:entry', { text: 'Game saved 💾', cat: 'positive' });
  }

  _load() {
    const raw = localStorage.getItem('simsSave');
    if (!raw) return;
    const state = JSON.parse(raw);
    Object.assign(this.clock, state.clock);
    for (const data of state.sims) {
      const sim = this.sims.find(s => s.id === data.id);
      if (sim) sim.restore(data);
    }
    if (state.memories) memorySystem.restore(state.memories);
    bus.emit('story:entry', { text: 'Game loaded 📂', cat: 'positive' });
  }
}

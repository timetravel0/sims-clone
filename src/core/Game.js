import * as THREE from 'three';
import { GameLoop } from './GameLoop.js';
import { bus } from './EventBus.js';
import { World } from '../world/World.js';
import { IsometricCamera } from '../world/IsometricCamera.js';
import { Sim } from '../entities/Sim.js';
import { UIManager } from '../ui/UIManager.js';
import { DayNightCycle } from '../world/DayNightCycle.js';
import { BuildMode } from '../world/BuildMode.js';
import { SaveLoad } from '../systems/SaveLoad.js';
import { Logger } from '../utils/Logger.js';

export class Game {
  constructor(container) {
    this._container = container;
    this._renderer = null;
    this._scene = null;
    this._loop = null;
    this._world = null;
    this._camera = null;
    this._sims = [];
    this._selectedSim = null;
    this._ui = null;
    this._dayNight = null;
    this._buildMode = null;
    this._saveLoad = null;
    this._init();
  }

  _init() {
    // Renderer
    this._renderer = new THREE.WebGLRenderer({ antialias: true });
    this._renderer.shadowMap.enabled = true;
    this._renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this._renderer.setPixelRatio(window.devicePixelRatio);
    this._renderer.setSize(window.innerWidth, window.innerHeight);
    this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 1.1;
    this._container.appendChild(this._renderer.domElement);

    // Scene
    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0x0e0d0b);
    this._scene.fog = new THREE.FogExp2(0x0e0d0b, 0.018);

    // Camera
    this._camera = new IsometricCamera(window.innerWidth / window.innerHeight);

    // World
    this._world = new World(this._scene);

    // Day/Night
    this._dayNight = new DayNightCycle(this._scene);

    // Build mode
    this._buildMode = new BuildMode(this._world, this._scene, this._renderer, this._camera);

    // Sims
    this._addSim('Alex', 2, 2, 0x4fc3f7);
    this._addSim('Sam',  5, 2, 0xf48fb1);
    this._addSim('Jo',   2, 5, 0xa5d6a7);
    this._selectSim(0);

    // Save/Load
    this._saveLoad = new SaveLoad(this);

    // UI
    this._ui = new UIManager(this._sims, this._selectedSim, bus);

    // Raycasting
    this._raycaster = new THREE.Raycaster();
    this._mouse = new THREE.Vector2();
    this._renderer.domElement.addEventListener('click', this._onCanvasClick.bind(this));

    // Resize
    window.addEventListener('resize', this._onResize.bind(this));

    // Loop
    this._loop = new GameLoop({
      onUpdate: (dt) => this._update(dt),
      onRender: () => this._render(),
    });

    // Expose game globally for save/load UI
    window._game = this;

    Logger.info('Game initialised — 3 Sims, build mode, day/night, save/load');
  }

  _addSim(name, gx, gz, color) {
    const sim = new Sim(this._scene, this._world, bus, name, color);
    sim.setPosition(gx, gz);
    this._sims.push(sim);
    return sim;
  }

  _selectSim(index) {
    this._sims.forEach((s, i) => s.setSelected(i === index));
    this._selectedSim = this._sims[index];
    bus.emit('sim:selected', { sim: this._selectedSim });
  }

  selectSimByIndex(i) { this._selectSim(i); }

  start() { this._loop.start(); }
  togglePause() { return this._loop.togglePause(); }
  setSpeed(s) { this._loop.setSpeed(s); }

  get buildMode() { return this._buildMode; }
  get sims() { return this._sims; }
  get world() { return this._world; }
  get selectedSim() { return this._selectedSim; }
  get dayNight() { return this._dayNight; }

  _update(dt) {
    this._sims.forEach(s => s.update(dt));
    this._camera.follow(new THREE.Vector3(this._selectedSim.worldX, 0, this._selectedSim.worldZ));
    this._dayNight.update(dt);
  }

  _render() {
    this._renderer.render(this._scene, this._camera.camera);
  }

  _onCanvasClick(e) {
    if (this._buildMode.active) {
      this._buildMode.handleClick(e);
      return;
    }
    const rect = this._renderer.domElement.getBoundingClientRect();
    this._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._mouse, this._camera.camera);

    // Check sim selection first
    const simMeshes = this._sims.map(s => s.mesh);
    const simHits = this._raycaster.intersectObjects(simMeshes, true);
    if (simHits.length > 0) {
      const mesh = simHits[0].object.parent || simHits[0].object;
      const idx = this._sims.findIndex(s => s.mesh === mesh || s.mesh.children.includes(simHits[0].object));
      if (idx >= 0) { this._selectSim(idx); return; }
    }

    // Ground click → walk selected sim
    const hits = this._raycaster.intersectObjects(this._world.groundMeshes);
    if (hits.length > 0) {
      const p = hits[0].point;
      const gx = Math.round(p.x);
      const gz = Math.round(p.z);
      this._selectedSim.walkTo(gx, gz);
    }
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this._renderer.setSize(w, h);
    this._camera.setAspect(w / h);
  }

  /** Serialise full state for save/load */
  serialise() {
    return {
      dayTime: this._dayNight.time,
      sims: this._sims.map(s => s.serialise()),
      furniture: this._world.furniture.map(f => ({
        id: f.id, gx: f.gx, gz: f.gz,
        needTarget: f.needTarget, restoreRate: f.restoreRate,
        color: f.color
      }))
    };
  }

  /** Restore state from saved data */
  restore(data) {
    if (data.dayTime !== undefined) this._dayNight.time = data.dayTime;
    data.sims?.forEach((sd, i) => this._sims[i]?.restore(sd));
  }
}

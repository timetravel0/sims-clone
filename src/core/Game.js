import * as THREE         from 'three';
import { GameLoop }       from './GameLoop.js';
import { bus }            from './EventBus.js';
import { World }          from '../world/World.js';
import { IsometricCamera} from '../world/IsometricCamera.js';
import { Sim }            from '../entities/Sim.js';
import { UIManager }      from '../ui/UIManager.js';
import { DayNightCycle }  from '../world/DayNightCycle.js';
import { BuildMode }      from '../world/BuildMode.js';
import { SaveLoad }       from '../systems/SaveLoad.js';
import { socialManager }  from '../systems/SocialManager.js';
import { NarrativeLog }   from '../systems/NarrativeLog.js';
import { DramaEngine }    from '../systems/DramaEngine.js';
import { ContextMenu }    from '../ui/ContextMenu.js';
import { WalkToAction, UseObjectAction, IdleAction } from '../ai/Action.js';
import { SocialAction }   from '../ai/SocialAction.js';
import { Logger }         from '../utils/Logger.js';

window._actionClasses       = { WalkToAction, UseObjectAction, IdleAction };
window._socialActionClasses = { SocialAction };

export class Game {
  constructor(container) {
    this._container = container;
    this._sims      = [];
    this._init();
  }

  _init() {
    // Renderer
    this._renderer = new THREE.WebGLRenderer({ antialias: true });
    this._renderer.shadowMap.enabled = true;
    this._renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    this._renderer.setPixelRatio(window.devicePixelRatio);
    this._renderer.setSize(window.innerWidth, window.innerHeight);
    this._renderer.toneMapping         = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 1.1;
    this._container.appendChild(this._renderer.domElement);

    // Scene
    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0x0e0d0b);
    this._scene.fog         = new THREE.FogExp2(0x0e0d0b, 0.018);

    // Camera — stored as _isoCamera (no getter/setter clash)
    this._isoCamera = new IsometricCamera(window.innerWidth / window.innerHeight);

    // World & systems
    this._world     = new World(this._scene);
    this._dayNight  = new DayNightCycle(this._scene);
    this._buildMode = new BuildMode(this._world, this._scene, this._renderer, this._isoCamera);

    // Sims
    this._addSim('Alex', 2, 2, 0x4fc3f7, { outgoing: 0.8, nice:  0.6, playful: 0.5,  neurotic: -0.2, ambitious:  0.3 });
    this._addSim('Sam',  5, 2, 0xf48fb1, { outgoing: 0.2, nice: -0.6, playful: -0.3, neurotic:  0.7, ambitious:  0.5 });
    this._addSim('Jo',   2, 5, 0xa5d6a7, { outgoing: 0.5, nice:  0.4, playful: 0.8,  neurotic: -0.4, ambitious: -0.3 });
    this._selectSim(0);

    // Narrative & drama
    this._narrativeLog = new NarrativeLog();
    this._dramaEngine  = new DramaEngine(this);
    this._contextMenu  = new ContextMenu(this, this._renderer);

    // UI & persistence
    this._saveLoad = new SaveLoad(this);
    this._ui       = new UIManager(this._sims, this._selectedSim, bus);

    // Input
    this._raycaster = new THREE.Raycaster();
    this._mouse     = new THREE.Vector2();
    this._renderer.domElement.addEventListener('click', this._onCanvasClick.bind(this));
    window.addEventListener('resize', this._onResize.bind(this));

    // Game loop
    this._loop = new GameLoop({
      onUpdate: dt => this._update(dt),
      onRender: ()  => this._render(),
    });

    window._game = this;
    Logger.info('Game ready');
  }

  // ── Public accessors ──────────────────────────────────────────────────────
  get camera()    { return this._isoCamera; }   // IsometricCamera wrapper
  get buildMode() { return this._buildMode; }
  get sims()      { return this._sims; }
  get world()     { return this._world; }
  get selectedSim() { return this._selectedSim; }
  get dayNight()  { return this._dayNight; }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  start()       { this._loop.start(); }
  togglePause() { return this._loop.togglePause(); }
  setSpeed(s)   { this._loop.setSpeed(s); }

  selectSimByIndex(i) { this._selectSim(i); }

  // ── Private ───────────────────────────────────────────────────────────────
  _addSim(name, gx, gz, color, traits = {}) {
    const sim = new Sim(this._scene, this._world, bus, name, color, traits);
    sim.setPosition(gx, gz);
    this._sims.push(sim);
    return sim;
  }

  _selectSim(i) {
    this._sims.forEach((s, idx) => s.setSelected(idx === i));
    this._selectedSim = this._sims[i];
    bus.emit('sim:selected', { sim: this._selectedSim });
  }

  _update(dt) {
    this._sims.forEach(s => s.update(dt));
    this._world.update(dt);
    this._isoCamera.follow(
      new THREE.Vector3(this._selectedSim.worldX, 0, this._selectedSim.worldZ)
    );
    this._dayNight.update(dt);
    this._dramaEngine.update(dt);
  }

  _render() {
    this._renderer.render(this._scene, this._isoCamera.camera);
  }

  _onCanvasClick(e) {
    if (this._buildMode.active) { this._buildMode.handleClick(e); return; }
    const rect = this._renderer.domElement.getBoundingClientRect();
    this._mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    this._mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._mouse, this._isoCamera.camera);

    // Left-click on a Sim → select it
    const simHits = this._raycaster.intersectObjects(this._sims.map(s => s.mesh), true);
    if (simHits.length > 0) {
      const hit = simHits[0].object;
      const idx = this._sims.findIndex(s =>
        s.mesh === hit || s.mesh === hit.parent || s.mesh === hit.parent?.parent);
      if (idx >= 0) { this._selectSim(idx); return; }
    }

    // Left-click on ground → walk
    const hits = this._raycaster.intersectObjects(this._world.groundMeshes);
    if (hits.length > 0) {
      const p = hits[0].point;
      this._selectedSim.walkTo(Math.round(p.x), Math.round(p.z));
    }
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this._renderer.setSize(w, h);
    this._isoCamera.setAspect(w / h);
  }

  serialise() {
    return {
      dayTime: this._dayNight.time,
      sims:    this._sims.map(s => s.serialise()),
      social:  socialManager.serialise(),
    };
  }

  restore(data) {
    if (data.dayTime !== undefined) this._dayNight.time = data.dayTime;
    data.sims?.forEach((sd, i) => this._sims[i]?.restore(sd));
    if (data.social) socialManager.restore(data.social);
  }
}

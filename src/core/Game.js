import * as THREE from 'three';
import { GameLoop } from './GameLoop.js';
import { bus } from './EventBus.js';
import { World } from '../world/World.js';
import { IsometricCamera } from '../world/IsometricCamera.js';
import { Sim } from '../entities/Sim.js';
import { UIManager } from '../ui/UIManager.js';
import { Logger } from '../utils/Logger.js';

export class Game {
  constructor(container) {
    this._container = container;
    this._renderer = null;
    this._scene = null;
    this._loop = null;
    this._world = null;
    this._camera = null;
    this._sim = null;
    this._ui = null;

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
    this._scene.fog = new THREE.Fog(0x0e0d0b, 40, 80);

    // Lighting
    const ambient = new THREE.AmbientLight(0xfff5e0, 0.6);
    this._scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff0cc, 1.4);
    sun.position.set(10, 20, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 80;
    sun.shadow.camera.left = -20;
    sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 20;
    sun.shadow.camera.bottom = -20;
    this._scene.add(sun);

    // Camera
    this._camera = new IsometricCamera(window.innerWidth / window.innerHeight);

    // World (tilemap + furniture)
    this._world = new World(this._scene);

    // Sim
    this._sim = new Sim(this._scene, this._world, bus);
    this._sim.setPosition(2, 2);

    // UI
    this._ui = new UIManager(this._sim, bus);

    // Raycasting for click-to-move
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

    Logger.info('Game initialised');
  }

  start() { this._loop.start(); }
  togglePause() { return this._loop.togglePause(); }
  setSpeed(s) { this._loop.setSpeed(s); }

  _update(dt) {
    this._sim.update(dt);
    this._camera.update(dt);
  }

  _render() {
    this._renderer.render(this._scene, this._camera.camera);
  }

  _onCanvasClick(e) {
    const rect = this._renderer.domElement.getBoundingClientRect();
    this._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._mouse, this._camera.camera);
    const hits = this._raycaster.intersectObjects(this._world.groundMeshes);
    if (hits.length > 0) {
      const p = hits[0].point;
      const gx = Math.floor(p.x + 0.5);
      const gz = Math.floor(p.z + 0.5);
      this._sim.walkTo(gx, gz);
    }
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this._renderer.setSize(w, h);
    this._camera.setAspect(w / h);
  }
}

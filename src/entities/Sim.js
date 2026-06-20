import * as THREE     from 'three';
import { SimNeeds }   from './SimNeeds.js';
import { SimBrain }   from './SimBrain.js';
import { Pathfinder } from '../ai/Pathfinder.js';
import { Mood }       from './Mood.js';
import { Personality} from './Personality.js';
import { bus }        from '../core/EventBus.js';

let _idCounter = 0;
const SPEED = 3.5; // tiles/sec

export class Sim {
  constructor(scene, world, _bus, name = 'Sim', color = 0x4fc3f7, traits = {}) {
    this.id        = `sim_${++_idCounter}`;
    this.name      = name;
    this._scene    = scene;
    this._world    = world;
    this.gx        = 1;
    this.gz        = 1;
    this.worldX    = 1;
    this.worldZ    = 1;
    this.isMoving  = false;
    this._path     = [];
    this._selected = false;

    // Personality (randomised unless traits provided)
    this.personality = new Personality(traits);

    // Needs (personality-aware decay)
    this.needs = new SimNeeds(this.personality);
    this.needs._emit = (vals) => bus.emit('simNeeds:update', { simId: this.id, values: vals });

    // Mood
    this.mood = new Mood(this);

    // Brain / AI
    this.brain = new SimBrain(this);

    // Mesh
    this._buildMesh(color);
    this._bubble = null;
    this._bubbleTimer = 0;

    scene.add(this.mesh);
  }

  _buildMesh(color) {
    this.mesh = new THREE.Group();
    // Body
    const bodyGeo = new THREE.CapsuleGeometry(0.22, 0.55, 4, 8);
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const body    = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.55;
    body.castShadow = true;
    this.mesh.add(body);
    // Head
    const headGeo = new THREE.SphereGeometry(0.18, 8, 8);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xf5cba7 });
    const head    = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.1;
    head.castShadow = true;
    this.mesh.add(head);
    // Selection ring
    const ringGeo = new THREE.RingGeometry(0.28, 0.35, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0 });
    this._ring = new THREE.Mesh(ringGeo, ringMat);
    this._ring.rotation.x = -Math.PI / 2;
    this._ring.position.y = 0.05;
    this.mesh.add(this._ring);
    this.mesh.position.set(this.gx, 0, this.gz);
  }

  setSelected(on) {
    this._selected = on;
    this._ring.material.opacity = on ? 0.85 : 0;
  }

  setPosition(gx, gz) {
    this.gx = gx; this.gz = gz;
    this.worldX = gx; this.worldZ = gz;
    this.mesh.position.set(gx, 0, gz);
  }

  walkTo(gx, gz) {
    const pf   = new Pathfinder(this._world.tilemap);
    const path = pf.find(this.gx, this.gz, gx, gz);
    if (path && path.length > 0) {
      this._world.doorManager?.resolvePath(path);
      this.startPath(path);
    }
  }

  startPath(path) {
    this._path    = path;
    this.isMoving = path.length > 0;
  }

  showBubble(text, duration = 1.5) {
    // Use DOM overlay
    const el = document.getElementById(`bubble-${this.id}`);
    if (!el) return;
    el.textContent   = text;
    el.style.opacity = '1';
    this._bubbleTimer = duration;
  }

  update(dt) {
    this._moveAlongPath(dt);
    this.needs.update(dt);
    this.mood.recalculate(this.needs.getAll(), this.personality);
    this.brain.update(dt);
    this._updateBubble(dt);
    // Mood ring tint
    const moodColor = this.mood.info?.color || '#fff';
    this._ring.material.color.set(moodColor);
  }

  _moveAlongPath(dt) {
    if (this._path.length === 0) { this.isMoving = false; return; }
    const target = this._path[0];
    const tx = target.x, tz = target.z;
    const dx = tx - this.worldX, dz = tz - this.worldZ;
    const dist = Math.sqrt(dx*dx + dz*dz);
    const step = SPEED * dt;
    if (dist <= step) {
      this.worldX = tx; this.worldZ = tz;
      this.gx = tx; this.gz = tz;
      this._path.shift();
      bus.emit('sim:arrived', { gx: this.gx, gz: this.gz });
    } else {
      this.worldX += (dx/dist)*step;
      this.worldZ += (dz/dist)*step;
    }
    this.mesh.position.set(this.worldX, 0, this.worldZ);
    this.isMoving = this._path.length > 0;
  }

  _updateBubble(dt) {
    if (this._bubbleTimer <= 0) return;
    this._bubbleTimer -= dt;
    if (this._bubbleTimer <= 0) {
      const el = document.getElementById(`bubble-${this.id}`);
      if (el) el.style.opacity = '0';
    }
  }

  serialise() {
    return {
      id: this.id, name: this.name,
      gx: this.gx, gz: this.gz,
      needs: this.needs.serialise(),
      mood:  this.mood.serialise(),
      personality: this.personality.serialise(),
    };
  }

  restore(data) {
    this.gx = data.gx; this.gz = data.gz;
    this.mesh.position.set(data.gx, 0, data.gz);
    this.needs.restore_state(data.needs);
    this.mood.restore(data.mood);
  }
}

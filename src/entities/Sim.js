import * as THREE       from 'three';
import { SimNeeds }     from './SimNeeds.js';
import { SimBrain }     from './SimBrain.js';
import { SimEmotions }  from './SimEmotions.js';
import { Pathfinder }   from '../ai/Pathfinder.js';
import { Mood }         from './Mood.js';
import { Personality }  from './Personality.js';
import { bus }          from '../core/EventBus.js';

let _idCounter = 0;
const SPEED = 3.5;

export class Sim {
  constructor(scene, world, _bus, name = 'Sim', color = 0x4fc3f7, traits = {}) {
    this.id        = `sim_${++_idCounter}`;
    this.name      = name;
    this.color     = color;
    this._scene    = scene;
    this._world    = world;
    this.gx        = 1;
    this.gz        = 1;
    this.worldX    = 1;
    this.worldZ    = 1;
    this.isMoving  = false;
    this._path     = [];
    this._selected = false;

    this.personality = new Personality(traits);
    this.needs       = new SimNeeds(this.personality);
    this.needs._emit = (vals) => bus.emit('simNeeds:update', { simId: this.id, values: vals });
    this.mood        = new Mood(this);
    this.emotions    = new SimEmotions(this);   // ← Sprint 1
    this.brain       = new SimBrain(this);

    this._buildMesh(color);
    this._bubble      = null;
    this._bubbleTimer = 0;

    scene.add(this.mesh);
  }

  _buildMesh(color) {
    this.mesh = new THREE.Group();
    const bodyGeo = new THREE.CapsuleGeometry(0.22, 0.55, 4, 8);
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const body    = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.55; body.castShadow = true;
    this.mesh.add(body);
    const headGeo = new THREE.SphereGeometry(0.18, 8, 8);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xf5cba7 });
    const head    = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.1; head.castShadow = true;
    this.mesh.add(head);
    const ringGeo = new THREE.RingGeometry(0.28, 0.35, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0
    });
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
    this._world.reserveCell(gx, gz, this);
  }

  walkTo(gx, gz) {
    const target = this._world.findNearestAvailableCell(gx, gz, this);
    if (!target) return;
    const pf = new Pathfinder(this._world.tilemap, (x, z) =>
      this._world.isCellOccupied(x, z, this.id) ||
      this._world.isCellReserved(x, z, this.id),
      (x1, z1, x2, z2) => this._world.wallManager?.isPassable(x1, z1, x2, z2) ?? true
    );
    const path = pf.find(this.gx, this.gz, target.x, target.z);
    if (path && path.length > 0) {
      if (!this._world.reserveCell(target.x, target.z, this)) return;
      this._world.doorManager?.resolvePath(path);
      this.startPath(path);
    }
  }

  startPath(path) { this._path = path; this.isMoving = path.length > 0; }

  showBubble(text, duration = 1.5) {
    const el = document.getElementById(`bubble-${this.id}`);
    if (!el) return;
    el.textContent = text; el.style.opacity = '1';
    this._bubbleTimer = duration;
  }

  update(dt) {
    this._moveAlongPath(dt);
    this.needs.update(dt);
    this.emotions.update(dt);                               // ← Sprint 1
    this.mood.recalculate(this.needs.getAll(), this.personality, this.emotions.moodBonus); // ← bonus
    this.brain.update(dt);
    this._updateBubble(dt);
    // Ring colour reflects dominant emotion > mood tier
    const dom = this.emotions.dominant;
    const ringColor = dom ? dom.def.color : (this.mood.info?.color || '#fff');
    this._ring.material.color.set(ringColor);
  }

  _moveAlongPath(dt) {
    if (this._path.length === 0) { this.isMoving = false; return; }
    const target = this._path[0];
    if (
      this._world.isCellOccupied(target.x, target.z, this.id) ||
      this._world.isCellReserved(target.x, target.z, this.id)
    ) {
      this.isMoving = true;
      return;
    }
    const dx = target.x - this.worldX, dz = target.z - this.worldZ;
    const dist = Math.sqrt(dx*dx + dz*dz);
    const step = SPEED * dt;
    if (dist <= step) {
      this.worldX = target.x; this.worldZ = target.z;
      this.gx = target.x; this.gz = target.z;
      this._path.shift();
      bus.emit('sim:arrived', { simId: this.id, gx: this.gx, gz: this.gz });
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
      id: this.id, name: this.name, color: this.color,
      gx: this.gx, gz: this.gz,
      needs:       this.needs.serialise(),
      mood:        this.mood.serialise(),
      emotions:    this.emotions.serialise(),
      personality: this.personality.serialise(),
    };
  }

  restore(data) {
    this.gx = data.gx; this.gz = data.gz;
    this.worldX = data.gx; this.worldZ = data.gz;
    this._path = [];
    this.isMoving = false;
    this.mesh.position.set(data.gx, 0, data.gz);
    this._world.reserveCell(data.gx, data.gz, this);
    if (data.personality) Object.assign(this.personality, data.personality);
    this.needs.restore_state(data.needs);
    this.mood.restore(data.mood);
    this.emotions.restore(data.emotions || {});
  }
}

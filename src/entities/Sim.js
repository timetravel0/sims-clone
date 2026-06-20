import * as THREE from 'three';
import { SimNeeds } from './SimNeeds.js';
import { SimBrain } from './SimBrain.js';
import { WalkToAction } from '../ai/Action.js';
import { SpeechBubble } from '../ui/SpeechBubble.js';

const SIM_HEIGHT = 0.9;
const WALK_SPEED = 3;

export class Sim {
  constructor(scene, world, bus, name = 'Sim', color = 0x4fc3f7) {
    this.id    = `sim_${Math.random().toString(36).slice(2, 7)}`;
    this.name  = name;
    this.color = color;
    this._scene = scene;
    this._world = world;
    this._bus   = bus;

    this.gx = 2; this.gz = 2;
    this._wx = 2; this._wz = 2;
    this._path = [];
    this._moving = false;
    this._moveProgress = 0;
    this._fromX = 2; this._fromZ = 2;
    this._toX = 2;   this._toZ = 2;
    this.walkSpeed = WALK_SPEED;
    this._selected = false;

    this.needs = new SimNeeds(this.id);
    this.brain = new SimBrain(this);
    this.bubble = new SpeechBubble(name);

    // Body mesh
    const body = new THREE.CapsuleGeometry(0.22, SIM_HEIGHT - 0.44, 4, 8);
    const mat  = new THREE.MeshLambertMaterial({ color });
    this.mesh  = new THREE.Mesh(body, mat);
    this.mesh.castShadow = true;
    this.mesh.position.set(this.gx, SIM_HEIGHT / 2, this.gz);
    scene.add(this.mesh);

    // Selection ring
    const ringGeo = new THREE.RingGeometry(0.28, 0.35, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0 });
    this._ring = new THREE.Mesh(ringGeo, ringMat);
    this._ring.rotation.x = -Math.PI / 2;
    this._ring.position.y = -SIM_HEIGHT / 2 + 0.02;
    this.mesh.add(this._ring);

    // Shadow blob
    const blobGeo = new THREE.CircleGeometry(0.2, 16);
    const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 });
    const blob = new THREE.Mesh(blobGeo, blobMat);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = -SIM_HEIGHT / 2 + 0.01;
    this.mesh.add(blob);
  }

  get worldX() { return this._wx; }
  get worldZ() { return this._wz; }

  setSelected(on) {
    this._selected = on;
    this._ring.material.opacity = on ? 0.9 : 0;
  }

  setPosition(gx, gz) {
    this.gx = gx; this.gz = gz;
    this._wx = gx; this._wz = gz;
    this._fromX = gx; this._fromZ = gz;
    this._toX = gx; this._toZ = gz;
    this.mesh.position.set(gx, this.mesh.position.y, gz);
  }

  walkTo(gx, gz) {
    this.brain.override(new WalkToAction(this, this._world, gx, gz));
  }

  showBubble(text, duration = 3) {
    this.bubble.show(text, this.mesh.position, duration);
  }

  update(dt) {
    this.needs.update(dt);
    this.brain.update(dt);
    this._updateMovement(dt);
    this.mesh.position.set(this._wx, SIM_HEIGHT / 2, this._wz);
    this.bubble.update(dt, this.mesh.position);
  }

  _updateMovement(dt) {
    if (!this._moving) return;
    this._moveProgress += this.walkSpeed * dt;
    if (this._moveProgress >= 1) {
      this._moveProgress = 0;
      this._wx = this._toX; this._wz = this._toZ;
      this.gx = this._toX; this.gz = this._toZ;
      if (this._path.length > 0) {
        const next = this._path.shift();
        this._fromX = this._toX; this._fromZ = this._toZ;
        this._toX = next.x; this._toZ = next.z;
      } else {
        this._moving = false;
        this._bus.emit('sim:arrived', { simId: this.id, gx: this.gx, gz: this.gz });
      }
    } else {
      this._wx = this._fromX + (this._toX - this._fromX) * this._moveProgress;
      this._wz = this._fromZ + (this._toZ - this._fromZ) * this._moveProgress;
    }
  }

  startPath(path) {
    if (!path || path.length === 0) return;
    this._path = [...path];
    const first = this._path.shift();
    this._fromX = this.gx; this._fromZ = this.gz;
    this._toX = first.x; this._toZ = first.z;
    this._moveProgress = 0;
    this._moving = true;
  }

  get isMoving() { return this._moving; }

  serialise() {
    return {
      name: this.name,
      gx: this.gx, gz: this.gz,
      needs: this.needs.snapshot()
    };
  }

  restore(data) {
    this.setPosition(data.gx, data.gz);
    if (data.needs) {
      for (const [k, v] of Object.entries(data.needs)) this.needs.set(k, v);
    }
  }
}

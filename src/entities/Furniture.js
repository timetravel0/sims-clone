import * as THREE from 'three';
import { ObjectRegistry } from '../systems/ObjectRegistry.js';

export class Furniture {
  constructor({ id, gx, gz, color, needTarget, restoreRate }) {
    this.id          = id;
    this.gx          = gx;
    this.gz          = gz;
    this.color       = color;
    this.needTarget  = needTarget;
    this.restoreRate = restoreRate;
    this.inUse       = false;

    // Custom onUse hook from registry
    const def = ObjectRegistry.get(id);
    this._onUse = def?.onUse || null;

    const geo = new THREE.BoxGeometry(0.8, 0.6, 0.8);
    const mat = new THREE.MeshLambertMaterial({ color });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(gx, 0.3, gz);
    this.mesh.castShadow  = true;
    this.mesh.receiveShadow = true;
  }

  /** Called each tick while a Sim is using this object */
  onUseTick(sim, dt) {
    if (this._onUse) this._onUse(sim, this, dt);
  }
}

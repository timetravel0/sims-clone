import * as THREE from 'three';
import { ObjectRegistry } from '../systems/ObjectRegistry.js';

// Social furniture gets a subtle glow ring to distinguish them visually
const SOCIAL_COLOR = 0xffd54f;

export class Furniture {
  constructor({ id, gx, gz, color, needTarget, restoreRate, social }) {
    this.id          = id;
    this.gx          = gx;
    this.gz          = gz;
    this.color       = color;
    this.needTarget  = needTarget;
    this.restoreRate = restoreRate;
    this.inUse       = false;
    this.social      = social ?? false;

    const def = ObjectRegistry.get(id);
    this._onUse = def?.onUse || null;

    // Main body
    const geo = new THREE.BoxGeometry(0.8, 0.6, 0.8);
    const mat = new THREE.MeshLambertMaterial({ color });
    this.mesh = new THREE.Group();
    const body = new THREE.Mesh(geo, mat);
    body.position.y = 0.3;
    body.castShadow = true;
    body.receiveShadow = true;
    this.mesh.add(body);

    // Social indicator: small gold ring on top
    if (this.social) {
      const ringGeo = new THREE.RingGeometry(0.38, 0.44, 20);
      const ringMat = new THREE.MeshBasicMaterial({
        color: SOCIAL_COLOR, side: THREE.DoubleSide, transparent: true, opacity: 0.7
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.62;
      this.mesh.add(ring);
    }

    this.mesh.position.set(gx, 0, gz);
  }

  onUseTick(sim, dt) {
    if (this._onUse) this._onUse(sim, this, dt);
  }
}

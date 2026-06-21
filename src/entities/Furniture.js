import * as THREE from 'three';
import { ObjectRegistry } from '../systems/ObjectRegistry.js';

// Social furniture gets a subtle glow ring to distinguish them visually
const SOCIAL_COLOR = 0xffd54f;

export class Furniture {
  constructor({ id, gx, gz, color, needTarget, restoreRate, social, affordances }) {
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
    this._affordances = affordances || def?.affordances || null;

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

  getAffordancesFor(_sim) {
    if (this.inUse || this.reservedBy) return [];
    if (this._affordances?.length) {
      return this._affordances.map(a => ({
        targetType: 'furniture',
        target: this,
        verb: a.verb || `use_${this.id}`,
        label: a.label || this.id,
        utility: { ...(a.utility || {}) },
        duration: a.duration ?? 5,
        requirements: a.requirements || {},
      }));
    }
    return [{
      targetType: 'furniture',
      target: this,
      verb: `use_${this.id}`,
      label: this.id,
      utility: { [this.needTarget]: this.restoreRate },
      duration: 6,
      requirements: {},
    }];
  }
}

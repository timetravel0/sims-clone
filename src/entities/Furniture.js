import * as THREE from 'three';
import { ObjectRegistry }       from '../systems/ObjectRegistry.js';
import { FurnitureMeshFactory, addSocialRing } from './FurnitureMeshFactory.js';

export class Furniture {
  constructor({ id, gx, gz, color, needTarget, restoreRate, social, affordances, functionTags, category, roomTags, label }) {
    this.id          = id;
    this.gx          = gx;
    this.gz          = gz;
    this.color       = color;
    this.needTarget  = needTarget;
    this.restoreRate = restoreRate;
    this.inUse       = false;
    this.social      = social ?? false;

    const def = ObjectRegistry.get(id);
    this.label        = label        ?? def?.label        ?? id;
    this.functionTags = functionTags ?? def?.functionTags ?? [];
    this.category     = category     ?? def?.category     ?? null;
    this.roomTags     = roomTags     ?? def?.roomTags     ?? [];
    this._onUse       = def?.onUse || null;
    this._affordances = affordances || def?.affordances || null;

    // Build procedural mesh
    this.mesh = FurnitureMeshFactory.build(id, color);

    // Social gold ring
    if (this.social) addSocialRing(this.mesh);

    this.mesh.position.set(gx, 0, gz);
  }

  onUseTick(sim, dt) {
    if (this._onUse) this._onUse(sim, this, dt);
  }

  getAffordancesFor(_sim) {
    if (this.inUse || this.reservedBy) return [];
    if (this._affordances?.length) {
      return this._affordances.map(a => ({
        targetType : 'furniture',
        target     : this,
        verb       : a.verb || `use_${this.id}`,
        label      : a.label || this.id,
        utility    : { ...(a.utility || {}) },
        duration   : a.duration ?? 5,
        requirements: a.requirements || {},
        skillGain  : a.skillGain ?? false,
      }));
    }
    return [{
      targetType  : 'furniture',
      target      : this,
      verb        : `use_${this.id}`,
      label       : this.id,
      utility     : { [this.needTarget]: this.restoreRate },
      duration    : 6,
      requirements: {},
    }];
  }
}

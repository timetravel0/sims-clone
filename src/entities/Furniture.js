import * as THREE from 'three';

export class Furniture {
  constructor({ id, gx, gz, color, needTarget, restoreRate }) {
    this.id = id;
    this.gx = gx;
    this.gz = gz;
    this.color = color;
    this.needTarget = needTarget;
    this.restoreRate = restoreRate;
    this.inUse = false;

    const geo = new THREE.BoxGeometry(0.8, 0.6, 0.8);
    const mat = new THREE.MeshLambertMaterial({ color });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(gx, 0.3, gz);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
  }
}

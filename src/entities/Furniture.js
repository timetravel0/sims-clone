import * as THREE from 'three';

export class Furniture {
  constructor({ id, gx, gz, color, needTarget, restoreRate }) {
    this.id = id;
    this.gx = gx;
    this.gz = gz;
    this.needTarget = needTarget;
    this.restoreRate = restoreRate; // points per second while in use
    this.inUse = false;

    const geo = new THREE.BoxGeometry(0.8, 0.6, 0.8);
    const mat = new THREE.MeshLambertMaterial({ color });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(gx, 0.3, gz);
    this.mesh.castShadow = true;

    // Label sprite (simple colored plane)
    const labelGeo = new THREE.PlaneGeometry(0.6, 0.2);
    const labelMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.12, side: THREE.DoubleSide
    });
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.position.set(0, 0.45, 0);
    label.rotation.x = -Math.PI / 2;
    this.mesh.add(label);
  }
}

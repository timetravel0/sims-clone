import * as THREE from 'three';
import { Furniture } from '../entities/Furniture.js';

export class World {
  constructor(scene, tileMap, eventBus) {
    this.scene = scene;
    this.tileMap = tileMap;
    this.eventBus = eventBus;
    this.groundMeshes = [];
    this.furniture = [];
    this.timeOfDay = 8;
    this.dayLengthSeconds = 180;
    this.buildGround();
    this.placeFurniture();
  }

  buildGround() {
    const geo = new THREE.BoxGeometry(1, 0.2, 1);
    const matGrass = new THREE.MeshStandardMaterial({ color: 0x65b96d });
    const matWall  = new THREE.MeshStandardMaterial({ color: 0x4b5563 });
    for (let j = 0; j < this.tileMap.height; j++) {
      for (let i = 0; i < this.tileMap.width; i++) {
        const tile = this.tileMap.tiles[j][i];
        const pos  = this.tileMap.gridToWorld(i, j);
        const mat  = tile.walkable ? matGrass : matWall;
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(pos.x, 0, pos.z);
        mesh.receiveShadow = true;
        mesh.userData = { i, j };
        this.scene.add(mesh);
        this.groundMeshes.push(mesh);
      }
    }
  }

  placeFurniture() {
    [
      ['bed',    3,  3],
      ['fridge', 15, 15],
      ['sofa',   9,  4],
      ['toilet', 16, 4],
      ['desk',   6,  14],
      ['shower', 14, 5],
    ].forEach(([type, i, j]) => this.addFurniture(type, i, j));
  }

  addFurniture(type, i, j) {
    const f = new Furniture(type, i, j, this.scene, this.tileMap);
    this.furniture.push(f);
    return f;
  }

  findNearestFurniture(type, simPos) {
    let nearest = null, nearestDist = Infinity;
    for (const f of this.furniture) {
      if (f.type !== type) continue;
      const d = Math.abs(f.gridPos.i - simPos.i) + Math.abs(f.gridPos.j - simPos.j);
      if (d < nearestDist) { nearestDist = d; nearest = f; }
    }
    return nearest;
  }

  update(dt) {
    this.timeOfDay += (24 / this.dayLengthSeconds) * dt;
    if (this.timeOfDay >= 24) this.timeOfDay -= 24;
    this.eventBus.emit('world:time', { timeOfDay: this.timeOfDay });
  }

  serialize() {
    return {
      timeOfDay: this.timeOfDay,
      furniture: this.furniture.map(f => ({ type: f.type, gridPos: f.gridPos })),
    };
  }

  resetFromData(data) {
    this.timeOfDay = data?.timeOfDay ?? 8;
  }
}

import * as THREE from 'three';
import { SimNeeds } from './SimNeeds.js';
import { SimBrain } from './SimBrain.js';
import { WalkToAction } from '../ai/Action.js';

export class Sim {
  constructor(name, scene, tileMap, eventBus, color = '#3f51b5') {
    this.name = name;
    this.scene = scene;
    this.tileMap = tileMap;
    this.eventBus = eventBus;
    this.color = color;
    this.needs = new SimNeeds();
    this.brain = new SimBrain(this, eventBus);
    this.gridPos = { i: 0, j: 0 };
    this.worldPos = { x: 0, z: 0 };
    this.speed = 2.8;
    this.selected = false;
    this.mesh = this.buildMesh();
    this.hitArea = this.buildHitArea();
    this.mesh.add(this.hitArea);
    scene.add(this.mesh);
  }

  buildMesh() {
    const g = new THREE.Group();
    this.body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 0.9, 12),
      new THREE.MeshStandardMaterial({ color: this.color })
    );
    this.body.position.y = 0.45;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xffccaa })
    );
    head.position.y = 1.05;
    this.marker = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.35, 12),
      new THREE.MeshStandardMaterial({ color: 0x00ff99, emissive: 0x006644 })
    );
    this.marker.position.y = 1.7;
    this.marker.visible = false;
    g.add(this.body, head, this.marker);
    return g;
  }

  buildHitArea() {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 1.8, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 })
    );
    m.position.y = 0.9;
    return m;
  }

  setSelected(flag) {
    this.selected = flag;
    this.marker.visible = flag;
    this.body.material.emissive = new THREE.Color(flag ? 0x222222 : 0x000000);
  }

  setGridPosition(i, j) {
    this.gridPos = { i, j };
    const w = this.tileMap.gridToWorld(i, j);
    this.worldPos = { x: w.x, z: w.z };
    this.mesh.position.set(w.x, 0, w.z);
  }

  goTo(i, j) {
    const action = new WalkToAction(this, i, j, this.tileMap);
    this.brain.queue.clear();
    this.brain.queue.push(action);
  }

  update(dt, world) {
    this.needs.tick(dt);
    this.brain.update(dt, world);
  }

  serialize() {
    return { name: this.name, color: this.color, gridPos: this.gridPos, needs: this.needs.getAll() };
  }

  restore(data) {
    this.setGridPosition(data.gridPos.i, data.gridPos.j);
    Object.entries(data.needs || {}).forEach(([k, v]) => {
      if (this.needs.values[k] !== undefined) this.needs.values[k] = v;
    });
  }
}

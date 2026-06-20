import * as THREE from 'three';

export class Furniture {
  constructor(type, i, j, scene, tileMap) {
    this.type = type;
    this.gridPos = { i, j };
    this.scene = scene;
    this.tileMap = tileMap;
    tileMap.tiles[j][i].furniture = this;
    const pos = tileMap.gridToWorld(i, j);
    this.mesh = new THREE.Group();
    this.effectMap = {
      bed:    { need: 'energy',  amount: 45, duration: 8 },
      fridge: { need: 'hunger',  amount: 40, duration: 4 },
      sofa:   { need: 'fun',     amount: 25, duration: 4 },
      toilet: { need: 'bladder', amount: 60, duration: 3 },
      desk:   { need: 'social',  amount: 18, duration: 5 },
      shower: { need: 'hygiene', amount: 50, duration: 5 },
    };
    this.buildMesh(type);
    this.mesh.position.set(pos.x, 0, pos.z);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
  }

  getEffect() {
    return this.effectMap[this.type] || { need: 'fun', amount: 5, duration: 2 };
  }

  buildMesh(type) {
    const add = m => { m.castShadow = true; m.receiveShadow = true; this.mesh.add(m); };
    const mat = color => new THREE.MeshStandardMaterial({ color });
    const box = (w, h, d, color) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color)); add(m); return m; };
    const cyl = (rt, rb, h, color) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 12), mat(color)); add(m); return m; };

    if (type === 'bed') {
      box(1, 0.4, 1.6, 0x8B4513).position.y = 0.2;
      box(0.9, 0.15, 1.4, 0xffffff).position.y = 0.48;
    } else if (type === 'fridge') {
      box(0.8, 1.6, 0.8, 0xc0c0c0).position.y = 0.8;
    } else if (type === 'sofa') {
      box(1.2, 0.5, 0.6, 0x556b2f).position.y = 0.25;
      const back = box(1.2, 0.6, 0.15, 0x556b2f);
      back.position.set(0, 0.55, -0.22);
    } else if (type === 'toilet') {
      cyl(0.25, 0.3, 0.5, 0xffffff).position.y = 0.25;
      box(0.4, 0.3, 0.2, 0xffffff).position.set(0, 0.65, -0.15);
    } else if (type === 'desk') {
      box(1.1, 0.1, 0.7, 0x8b5a2b).position.y = 0.7;
    } else if (type === 'shower') {
      box(0.9, 0.12, 0.9, 0xe5e7eb).position.y = 0.06;
      cyl(0.05, 0.05, 1.5, 0x9ca3af).position.set(0.3, 0.75, 0.3);
    }
  }
}

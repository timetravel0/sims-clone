import * as THREE from 'three';
import { TileMap, TILE } from './TileMap.js';
import { Furniture } from '../entities/Furniture.js';

const FLOOR_COLOR = 0x4a3f35;
const WALL_COLOR  = 0x2e2620;

export class World {
  constructor(scene) {
    this._scene = scene;
    this.tilemap = new TileMap(16, 16);
    this.groundMeshes = [];
    this.furniture = [];
    this._floorMat = new THREE.MeshLambertMaterial({ color: FLOOR_COLOR });
    this._wallMat  = new THREE.MeshLambertMaterial({ color: WALL_COLOR });
    this._buildFloor();
    this._buildWalls();
    this._placeFurniture();
  }

  _buildFloor() {
    const geo = new THREE.BoxGeometry(1, 0.1, 1);
    for (let z = 0; z < this.tilemap.height; z++) {
      for (let x = 0; x < this.tilemap.width; x++) {
        if (this.tilemap.get(x, z) !== TILE.WALL) {
          const mesh = new THREE.Mesh(geo, this._floorMat);
          mesh.position.set(x, -0.05, z);
          mesh.receiveShadow = true;
          mesh.userData = { gridX: x, gridZ: z, isGround: true };
          this._scene.add(mesh);
          this.groundMeshes.push(mesh);
        }
      }
    }
  }

  _buildWalls() {
    const geo = new THREE.BoxGeometry(1, 1.5, 1);
    for (let z = 0; z < this.tilemap.height; z++) {
      for (let x = 0; x < this.tilemap.width; x++) {
        if (this.tilemap.get(x, z) === TILE.WALL) {
          const mesh = new THREE.Mesh(geo, this._wallMat);
          mesh.position.set(x, 0.75, z);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          this._scene.add(mesh);
        }
      }
    }
  }

  _placeFurniture() {
    const items = [
      { id: 'bed',    gx: 3,  gz: 3,  color: 0x6b9ac4, needTarget: 'energy',  restoreRate: 30 },
      { id: 'fridge', gx: 12, gz: 3,  color: 0xd0ece7, needTarget: 'hunger',  restoreRate: 40 },
      { id: 'toilet', gx: 12, gz: 12, color: 0xf0f0e8, needTarget: 'bladder', restoreRate: 60 },
      { id: 'couch',  gx: 3,  gz: 12, color: 0xc9a96e, needTarget: 'comfort', restoreRate: 20 },
      { id: 'tv',     gx: 8,  gz: 5,  color: 0x1a1a2e, needTarget: 'fun',     restoreRate: 20 },
      { id: 'shower', gx: 8,  gz: 12, color: 0xa8d8ea, needTarget: 'hygiene', restoreRate: 35 },
    ];
    for (const item of items) this._addFurniture(item);
  }

  _addFurniture(item) {
    const f = new Furniture(item);
    this._scene.add(f.mesh);
    this.tilemap.set(item.gx, item.gz, TILE.FURNITURE);
    this.furniture.push(f);
    return f;
  }

  /** Called by BuildMode to place a new piece of furniture */
  placeFurniture(item) {
    if (!this.tilemap.isWalkable(item.gx, item.gz)) return false;
    this._addFurniture(item);
    return true;
  }

  /** Remove furniture at grid position */
  removeFurniture(gx, gz) {
    const idx = this.furniture.findIndex(f => f.gx === gx && f.gz === gz);
    if (idx < 0) return false;
    const f = this.furniture[idx];
    this._scene.remove(f.mesh);
    this.tilemap.set(gx, gz, 0);
    this.furniture.splice(idx, 1);
    return true;
  }

  getFurnitureFor(needKey) {
    return this.furniture.find(f => f.needTarget === needKey) || null;
  }
}

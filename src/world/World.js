import * as THREE from 'three';
import { TileMap, TILE } from './TileMap.js';
import { Furniture } from '../entities/Furniture.js';
import { DoorManager } from './DoorManager.js';
import { DEFAULT_HOUSE_FURNITURE } from '../config/defaultScenario.js';
import { bus } from '../core/EventBus.js';

const FLOOR_COLOR = 0x4a3f35;
const WALL_COLOR  = 0x2e2620;

export class World {
  constructor(scene) {
    this._scene  = scene;
    this.scene   = scene; // exposed for DoorManager
    this.tilemap = new TileMap(16, 16);
    this.groundMeshes = [];
    this.furniture    = [];
    this._cellReservations = new Map();
    this._wallMeshes = new Map();   // "x,z" → mesh (perimeter/grid walls)
    this._expansions = [];          // {direction, tiles} log, replayed on load
    this.kitchenHygiene = 100;      // 0..100 — dirtied by cooking, restored by washing
    this.dirtyDishes = 0;
    this._floorMat = new THREE.MeshLambertMaterial({ color: FLOOR_COLOR });
    this._wallMat  = new THREE.MeshLambertMaterial({ color: WALL_COLOR });

    this._buildFloor();
    this._buildWalls();
    this._placeFurniture();

    this.doorManager = new DoorManager(this);
    this._placeDoors();
    this.entryPoints = this._buildEntryPoints();
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
    for (let z = 0; z < this.tilemap.height; z++) {
      for (let x = 0; x < this.tilemap.width; x++) {
        if (this.tilemap.get(x, z) === TILE.WALL) this._addWallMesh(x, z);
      }
    }
  }

  _addWallMesh(x, z) {
    const key = `${x},${z}`;
    if (this._wallMeshes.has(key)) return;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1.5, 1), this._wallMat);
    mesh.position.set(x, 0.75, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this._scene.add(mesh);
    this._wallMeshes.set(key, mesh);
  }

  _removeWallMesh(x, z) {
    const key = `${x},${z}`;
    const mesh = this._wallMeshes.get(key);
    if (!mesh) return;
    this._scene.remove(mesh);
    this._wallMeshes.delete(key);
  }

  _placeFurniture() {
    for (const item of DEFAULT_HOUSE_FURNITURE) this._addFurniture(item);
  }

  _placeDoors() {
    // Two doors on the bottom/top walls
    this.doorManager.addDoor({ gx: 5,  gz: 0,  axis: 'z' });
    this.doorManager.addDoor({ gx: 10, gz: 15, axis: 'z' });
  }

  _buildEntryPoints() {
    const doors = this.doorManager?.doors ?? [];
    const points = doors.map((door, i) => {
      const isNorth = door.gz === 0;
      const insideZ = isNorth ? 1 : this.tilemap.height - 2;
      // The current map has no walkable outside strip. Keep the public entry
      // semantically tied to the door but spawn visitors on the nearest walkable
      // porch/inside tile to avoid pathing into a closed WALL door tile.
      return {
        id: i === 0 ? 'front_door' : `entry_${i + 1}`,
        gx: door.gx,
        gz: insideZ,
        spawnGx: door.gx,
        spawnGz: insideZ,
        porchGx: door.gx,
        porchGz: insideZ,
        doorGx: door.gx,
        doorGz: door.gz,
        insideGx: door.gx,
        insideGz: insideZ,
        outsideVirtual: true,
        type: i === 0 ? 'front_door' : 'back_door',
      };
    });
    if (points.length > 0) return points;
    const x = Math.floor(this.tilemap.width / 2);
    return [{
      id: 'fallback_edge',
      gx: x,
      gz: 1,
      spawnGx: x,
      spawnGz: 1,
      porchGx: x,
      porchGz: 1,
      doorGx: x,
      doorGz: 0,
      insideGx: x,
      insideGz: 1,
      outsideVirtual: true,
      type: 'front_door',
    }];
  }

  getEntryPoint(id) {
    return this.entryPoints?.find(p => p.id === id) ?? null;
  }

  getEntryPointByType(type = 'front_door') {
    return this.entryPoints?.find(p => p.type === type) ?? this.entryPoints?.[0] ?? null;
  }

  _addFurniture(item) {
    const f = new Furniture(item);
    this._scene.add(f.mesh);
    this.tilemap.set(item.gx, item.gz, TILE.FURNITURE);
    this.furniture.push(f);
    return f;
  }

  placeFurniture(item) {
    if (!this.isCellAvailable(item.gx, item.gz)) return false;
    this._addFurniture(item);
    return true;
  }

  // ── Save/load ──────────────────────────────────────────────────────────────

  /** All current furniture (defaults + player-placed) as plain data. */
  serialiseFurniture() {
    return this.furniture.map(f => ({
      id: f.id, gx: f.gx, gz: f.gz, color: f.color,
      needTarget: f.needTarget, restoreRate: f.restoreRate, social: f.social,
    }));
  }

  /** Replace the whole furniture set from saved data. */
  restoreFurniture(list) {
    if (!Array.isArray(list)) return;
    for (const f of this.furniture) {
      this._scene.remove(f.mesh);
      this.tilemap.set(f.gx, f.gz, TILE.FLOOR);
    }
    this.furniture = [];
    for (const item of list) this._addFurniture(item);
  }

  removeFurniture(gx, gz) {
    const idx = this.furniture.findIndex(f => f.gx === gx && f.gz === gz);
    if (idx < 0) return false;
    const f = this.furniture.splice(idx, 1)[0];
    this._scene.remove(f.mesh);
    this.tilemap.set(gx, gz, TILE.FLOOR);
    return true;
  }

  moveFurniture(fromGx, fromGz, toGx, toGz) {
    const f = this.furniture.find(o => o.gx === fromGx && o.gz === fromGz);
    if (!f || f.inUse || f.reservedBy) return false;
    if (!this.tilemap.isWalkable(toGx, toGz)) return false;
    this.tilemap.set(fromGx, fromGz, TILE.FLOOR);
    this.tilemap.set(toGx, toGz, TILE.FURNITURE);
    f.gx = toGx; f.gz = toGz;
    f.mesh.position.set(toGx, f.mesh.position.y, toGz);
    return true;
  }

  getFurnitureFor(needKey) {
    return this.furniture.find(f => f.needTarget === needKey) || null;
  }

  update(dt) {
    this.doorManager.update(dt);
  }

  _cellKey(gx, gz) { return `${gx},${gz}`; }

  isCellOccupied(gx, gz, exceptSimId = null) {
    const sims = globalThis.window?._game?.sims || [];
    return sims.some(sim => {
      if (sim.id === exceptSimId) return false;
      if (sim._atWork) return false;   // away at work — not a blocker
      const dx = sim.worldX - gx;
      const dz = sim.worldZ - gz;
      return Math.sqrt(dx * dx + dz * dz) < 0.55;
    });
  }

  isCellReserved(gx, gz, exceptSimId = null) {
    const by = this._cellReservations.get(this._cellKey(gx, gz));
    return !!by && by !== exceptSimId;
  }

  isCellAvailable(gx, gz, exceptSimId = null) {
    return this.tilemap.isWalkable(gx, gz) &&
      !this.isCellOccupied(gx, gz, exceptSimId) &&
      !this.isCellReserved(gx, gz, exceptSimId);
  }

  reserveCell(gx, gz, sim) {
    if (!sim || !this.isCellAvailable(gx, gz, sim.id)) return false;
    this.releaseCellFor(sim.id);
    this._cellReservations.set(this._cellKey(gx, gz), sim.id);
    return true;
  }

  releaseCellFor(simId) {
    for (const [key, by] of this._cellReservations) {
      if (by === simId) this._cellReservations.delete(key);
    }
  }

  findNearestAvailableCell(gx, gz, sim, maxRadius = 3) {
    if (this.isCellAvailable(gx, gz, sim?.id)) return { x: gx, z: gz };
    for (let r = 1; r <= maxRadius; r++) {
      const cells = [];
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) + Math.abs(dz) !== r) continue;
          cells.push({ x: gx + dx, z: gz + dz });
        }
      }
      cells.sort((a, b) =>
        Math.abs(a.x - gx) + Math.abs(a.z - gz) -
        (Math.abs(b.x - gx) + Math.abs(b.z - gz))
      );
      const found = cells.find(c => this.isCellAvailable(c.x, c.z, sim?.id));
      if (found) return found;
    }
    return null;
  }

  expandLot(direction, tiles = 8) {
    // Only 'right'/'bottom' append without shifting existing coords — 'left'/'top'
    // would renumber all furniture/sim positions, so we reject them here.
    if (direction !== 'right' && direction !== 'bottom') return false;
    this.tilemap.expand(direction, tiles);
    this._expansions.push({ direction, tiles });
    const geo = new THREE.BoxGeometry(1, 0.1, 1);
    const floorKeys = new Set(this.groundMeshes.map(m => `${m.position.x},${m.position.z}`));
    for (let z = 0; z < this.tilemap.height; z++) {
      for (let x = 0; x < this.tilemap.width; x++) {
        const key = `${x},${z}`;
        if (this.tilemap.get(x, z) === TILE.WALL) {
          this._addWallMesh(x, z);            // new border walls
        } else {
          this._removeWallMesh(x, z);          // old border opened to floor
          if (!floorKeys.has(key)) {
            const mesh = new THREE.Mesh(geo, this._floorMat);
            mesh.position.set(x, -0.05, z);
            mesh.receiveShadow = true;
            mesh.userData = { gridX: x, gridZ: z, isGround: true };
            this._scene.add(mesh);
            this.groundMeshes.push(mesh);
            floorKeys.add(key);
          }
        }
      }
    }
    bus.emit('wall:placed'); // triggers RoomDetector.analyse()
    return true;
  }

  // ── Kitchen hygiene (WP3/WP8 dish-washing loop) ─────────────────────────────
  /** A cooked meal leaves dirty dishes and lowers kitchen hygiene. */
  soilKitchen(dishes = 1) {
    this.dirtyDishes += dishes;
    this.kitchenHygiene = Math.max(0, this.kitchenHygiene - 6 * dishes);
  }
  /** Wash up — requires a sink on the lot. Returns true if anything was cleaned. */
  washDishes() {
    if (!this.furniture.some(f => f.functionTags?.includes('wash'))) return false;
    if (this.dirtyDishes === 0 && this.kitchenHygiene >= 100) return false;
    this.dirtyDishes = 0;
    this.kitchenHygiene = 100;
    return true;
  }
  serialiseKitchen() { return { hygiene: this.kitchenHygiene, dishes: this.dirtyDishes }; }
  restoreKitchen(d) { if (d) { this.kitchenHygiene = d.hygiene ?? 100; this.dirtyDishes = d.dishes ?? 0; } }

  /** Lot expansion log → replayed on load to rebuild the grown grid + meshes. */
  serialiseExpansions() { return this._expansions.map(e => ({ ...e })); }
  restoreExpansions(list) {
    if (!Array.isArray(list)) return;
    for (const e of list) this.expandLot(e.direction, e.tiles);
  }

  randomAvailableCell(sim) {
    const walkable = [];
    for (let z = 0; z < this.tilemap.height; z++) {
      for (let x = 0; x < this.tilemap.width; x++) {
        if (this.isCellAvailable(x, z, sim?.id)) walkable.push({ x, z });
      }
    }
    if (walkable.length === 0) return null;
    return walkable[Math.floor(Math.random() * walkable.length)];
  }

  reserveFurniture(furniture, sim) {
    if (!furniture || !sim) return false;
    if (furniture.inUse || (furniture.reservedBy && furniture.reservedBy !== sim.id)) return false;
    furniture.reservedBy = sim.id;
    return true;
  }

  releaseFurniture(furniture, sim) {
    if (!furniture || !sim) return;
    if (furniture.reservedBy === sim.id) furniture.reservedBy = null;
  }
}

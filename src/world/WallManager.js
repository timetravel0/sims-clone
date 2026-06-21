/**
 * WallManager — Sprint 5
 * Manages walls and doors on the tile grid.
 *
 * Architecture:
 *  - Walls are stored as edges between adjacent tiles.
 *  - An edge is identified by a canonical key: "x1,z1:x2,z2" (smaller coord first).
 *  - Walls block movement between adjacent tiles (TileMap walkability).
 *  - Doors replace a wall segment and allow passage (walkable edge).
 *
 * Emits:
 *   wall:placed   { x1, z1, x2, z2 }
 *   wall:removed  { x1, z1, x2, z2 }
 *   door:placed   { x1, z1, x2, z2 }
 *   door:removed  { x1, z1, x2, z2 }
 */
import * as THREE from 'three';
import { bus }    from '../core/EventBus.js';

const WALL_H      = 1.8;   // height in world units
const WALL_T      = 0.1;   // thickness
const WALL_COLOR  = 0xd4c9b0;
const DOOR_COLOR  = 0x8b6914;

function edgeKey(x1, z1, x2, z2) {
  // Canonical: smaller grid coord first
  if (x1 < x2 || (x1 === x2 && z1 < z2)) return `${x1},${z1}:${x2},${z2}`;
  return `${x2},${z2}:${x1},${z1}`;
}

function edgeMidAndRot(x1, z1, x2, z2) {
  const mx = (x1 + x2) / 2;
  const mz = (z1 + z2) / 2;
  // Horizontal wall (same Z) → no rotation; Vertical wall (same X) → rotate 90°
  const rotY = (z1 === z2) ? 0 : Math.PI / 2;
  return { mx, mz, rotY };
}

export class WallManager {
  constructor(scene, tileMap) {
    this._scene   = scene;
    this._tileMap = tileMap;
    /** @type {Map<string, {type:'wall'|'door', mesh: THREE.Mesh}>} */
    this._edges   = new Map();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  placeWall(x1, z1, x2, z2) {
    const key = edgeKey(x1, z1, x2, z2);
    if (this._edges.has(key)) return false; // already occupied
    const mesh = this._buildMesh('wall', x1, z1, x2, z2);
    this._scene.add(mesh);
    this._edges.set(key, { type: 'wall', mesh });
    this._tileMap?.blockEdge(x1, z1, x2, z2, true);
    bus.emit('wall:placed', { x1, z1, x2, z2 });
    return true;
  }

  placeDoor(x1, z1, x2, z2) {
    const key = edgeKey(x1, z1, x2, z2);
    // Remove existing wall first if present
    if (this._edges.has(key)) this._removeEdge(key);
    const mesh = this._buildMesh('door', x1, z1, x2, z2);
    this._scene.add(mesh);
    this._edges.set(key, { type: 'door', mesh });
    this._tileMap?.blockEdge(x1, z1, x2, z2, false); // doors are passable
    bus.emit('door:placed', { x1, z1, x2, z2 });
    return true;
  }

  removeEdge(x1, z1, x2, z2) {
    return this._removeEdge(edgeKey(x1, z1, x2, z2));
  }

  hasWall(x1, z1, x2, z2) {
    const e = this._edges.get(edgeKey(x1, z1, x2, z2));
    return e?.type === 'wall';
  }

  hasDoor(x1, z1, x2, z2) {
    const e = this._edges.get(edgeKey(x1, z1, x2, z2));
    return e?.type === 'door';
  }

  isPassable(x1, z1, x2, z2) {
    const e = this._edges.get(edgeKey(x1, z1, x2, z2));
    // No edge = open; door = open; wall = blocked
    return !e || e.type === 'door';
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _removeEdge(key) {
    const entry = this._edges.get(key);
    if (!entry) return false;
    this._scene.remove(entry.mesh);
    entry.mesh.geometry.dispose();
    entry.mesh.material.dispose();
    this._edges.delete(key);
    // Unblock edge in tileMap
    const [a, b] = key.split(':').map(p => p.split(',').map(Number));
    this._tileMap?.blockEdge(a[0], a[1], b[0], b[1], false);
    const evName = entry.type === 'wall' ? 'wall:removed' : 'door:removed';
    bus.emit(evName, { x1: a[0], z1: a[1], x2: b[0], z2: b[1] });
    return true;
  }

  _buildMesh(type, x1, z1, x2, z2) {
    const { mx, mz, rotY } = edgeMidAndRot(x1, z1, x2, z2);
    const color = type === 'door' ? DOOR_COLOR : WALL_COLOR;

    let geo, mat, mesh;
    if (type === 'wall') {
      geo  = new THREE.BoxGeometry(1.0, WALL_H, WALL_T);
      mat  = new THREE.MeshLambertMaterial({ color });
      mesh = new THREE.Mesh(geo, mat);
    } else {
      // Door: lower panel + two side jambs + lintel
      mesh = new THREE.Group();
      // Frame
      const frameMat = new THREE.MeshLambertMaterial({ color: WALL_COLOR });
      const jambGeo  = new THREE.BoxGeometry(WALL_T * 2, WALL_H, WALL_T);
      const lintelGeo = new THREE.BoxGeometry(1.0, WALL_T * 2, WALL_T);
      const lJamb  = new THREE.Mesh(jambGeo,   frameMat);
      const rJamb  = new THREE.Mesh(jambGeo,   frameMat);
      const lintel = new THREE.Mesh(lintelGeo, frameMat);
      lJamb.position.set(-0.45, 0, 0);
      rJamb.position.set( 0.45, 0, 0);
      lintel.position.set(0, WALL_H / 2 - WALL_T, 0);
      // Door panel (slightly inset)
      const panelGeo = new THREE.BoxGeometry(0.85, WALL_H - WALL_T * 2, WALL_T * 0.5);
      const panelMat = new THREE.MeshLambertMaterial({ color });
      const panel = new THREE.Mesh(panelGeo, panelMat);
      panel.position.set(0, -WALL_T, WALL_T * 0.5);
      mesh.add(lJamb, rJamb, lintel, panel);
    }

    mesh.position.set(mx, WALL_H / 2, mz);
    mesh.rotation.y = rotY;
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // ── Serialise ─────────────────────────────────────────────────────────────

  serialise() {
    const edges = [];
    for (const [key, { type }] of this._edges) {
      const [a, b] = key.split(':').map(p => p.split(',').map(Number));
      edges.push({ type, x1: a[0], z1: a[1], x2: b[0], z2: b[1] });
    }
    return { edges };
  }

  restore(data) {
    if (!data?.edges) return;
    // Clear existing
    for (const key of [...this._edges.keys()]) this._removeEdge(key);
    for (const e of data.edges) {
      if (e.type === 'wall') this.placeWall(e.x1, e.z1, e.x2, e.z2);
      else                   this.placeDoor(e.x1, e.z1, e.x2, e.z2);
    }
  }
}

/**
 * RoomDetector — Sprint 6
 * Detects enclosed rooms on the tile grid using flood-fill (BFS).
 *
 * A room is a set of tiles fully enclosed by walls (no gap to tiles outside).
 * Open areas (connected to the map boundary through wall-free paths) are NOT rooms.
 *
 * Room classification by size:
 *   1-4 tiles   → 'closet'
 *   5-9 tiles   → 'small room'
 *   10-20 tiles → 'room'
 *   21+ tiles   → 'large room'
 *
 * Room mood bonus applied to Sims inside the room:
 *   closet:       -5  (claustrophobic)
 *   small room:   +2
 *   room:         +5
 *   large room:   +8
 *
 * Emits:
 *   rooms:updated  { rooms: Room[] }   — after each analyse() call
 *
 * @typedef {{ id:number, tiles:Set<string>, type:string, moodBonus:number, centroid:{x,z} }} Room
 */
import { bus } from '../core/EventBus.js';

const GRID = 16;
const SIZE_THRESHOLDS = [
  { max: 4,  type: 'closet',     moodBonus: -5 },
  { max: 9,  type: 'small room', moodBonus:  2 },
  { max: 20, type: 'room',       moodBonus:  5 },
  { max: Infinity, type: 'large room', moodBonus: 8 },
];

function tileKey(x, z) { return `${x},${z}`; }
function keyToCoord(k) { const [x,z]=k.split(',').map(Number); return {x,z}; }

export class RoomDetector {
  /**
   * @param {TileMap}    tileMap
   * @param {WallManager} wallManager
   */
  constructor(tileMap, wallManager) {
    this._tileMap = tileMap;
    this._wm      = wallManager;
    /** @type {Room[]} */
    this._rooms   = [];

    // Re-analyse whenever walls change
    bus.on('wall:placed',  () => this.analyse());
    bus.on('wall:removed', () => this.analyse());
    bus.on('door:placed',  () => this.analyse());
    bus.on('door:removed', () => this.analyse());
  }

  get rooms() { return this._rooms; }

  // ── Public ───────────────────────────────────────────────────────────────

  /** Full BFS flood-fill analysis. O(grid^2). */
  analyse() {
    const visited = new Set();
    const regions = [];

    for (let x = 0; x < GRID; x++) {
      for (let z = 0; z < GRID; z++) {
        const k = tileKey(x, z);
        if (visited.has(k)) continue;
        if (!this._tileMap?.isWalkable(x, z)) { visited.add(k); continue; }
        const region = this._floodFill(x, z, visited);
        regions.push(region);
      }
    }

    // A region is a room only if it does NOT touch the grid boundary
    this._rooms = regions
      .filter(r => !this._touchesBoundary(r))
      .map((r, i) => this._classifyRoom(r, i));

    bus.emit('rooms:updated', { rooms: this._rooms });
    return this._rooms;
  }

  /** Returns the room a tile belongs to, or null */
  roomAt(gx, gz) {
    const k = tileKey(gx, gz);
    return this._rooms.find(r => r.tiles.has(k)) ?? null;
  }

  /** Mood bonus for a Sim at (gx, gz) */
  moodBonusAt(gx, gz) {
    return this.roomAt(gx, gz)?.moodBonus ?? 0;
  }

  // ── BFS ───────────────────────────────────────────────────────────────────

  _floodFill(startX, startZ, visited) {
    const region = new Set();
    const queue  = [{ x: startX, z: startZ }];
    visited.add(tileKey(startX, startZ));

    while (queue.length) {
      const { x, z } = queue.shift();
      region.add(tileKey(x, z));

      const neighbours = [
        [x+1, z], [x-1, z], [x, z+1], [x, z-1],
      ];

      for (const [nx, nz] of neighbours) {
        if (nx < 0 || nx >= GRID || nz < 0 || nz >= GRID) continue;
        const nk = tileKey(nx, nz);
        if (visited.has(nk)) continue;
        // Wall between (x,z) and (nx,nz) blocks the flood
        if (this._wm && !this._wm.isPassable(x, z, nx, nz)) {
          // Don't cross walls (but mark as visited to avoid re-queuing)
          continue;
        }
        if (!this._tileMap?.isWalkable(nx, nz)) { visited.add(nk); continue; }
        visited.add(nk);
        queue.push({ x: nx, z: nz });
      }
    }
    return region;
  }

  _touchesBoundary(region) {
    for (const k of region) {
      const { x, z } = keyToCoord(k);
      if (x === 0 || x === GRID - 1 || z === 0 || z === GRID - 1) return true;
    }
    return false;
  }

  _classifyRoom(tiles, id) {
    const size = tiles.size;
    const { type, moodBonus } = SIZE_THRESHOLDS.find(t => size <= t.max);
    // Centroid
    let sx = 0, sz = 0;
    for (const k of tiles) { const c = keyToCoord(k); sx += c.x; sz += c.z; }
    const centroid = { x: Math.round(sx / size), z: Math.round(sz / size) };
    return { id, tiles, type, moodBonus, centroid, size };
  }
}

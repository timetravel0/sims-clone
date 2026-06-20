/**
 * A* pathfinder on the TileMap grid.
 * Returns array of {x,z} cells from (startX,startZ) to (goalX,goalZ), excluding start.
 * Returns null if no path found.
 */
export class Pathfinder {
  constructor(tilemap) {
    this._map = tilemap;
  }

  find(sx, sz, gx, gz) {
    if (!this._map.isWalkable(gx, gz)) {
      // Try adjacent walkable cell
      const adj = this._adjacent(gx, gz);
      if (adj.length === 0) return null;
      ({ x: gx, z: gz } = adj[0]);
    }

    const key = (x, z) => `${x},${z}`;
    const h = (x, z) => Math.abs(x - gx) + Math.abs(z - gz);

    const open = new Map();
    const closed = new Set();
    const g = new Map();
    const parent = new Map();

    const start = key(sx, sz);
    g.set(start, 0);
    open.set(start, h(sx, sz));
    parent.set(start, null);

    while (open.size > 0) {
      // Pop lowest f
      let curKey = null, curF = Infinity;
      for (const [k, f] of open) { if (f < curF) { curF = f; curKey = k; } }
      open.delete(curKey);
      closed.add(curKey);

      const [cx, cz] = curKey.split(',').map(Number);
      if (cx === gx && cz === gz) return this._reconstruct(parent, curKey, key(sx, sz));

      for (const nb of this._neighbors(cx, cz)) {
        const nk = key(nb.x, nb.z);
        if (closed.has(nk)) continue;
        const tentG = g.get(curKey) + 1;
        if (!g.has(nk) || tentG < g.get(nk)) {
          g.set(nk, tentG);
          parent.set(nk, curKey);
          open.set(nk, tentG + h(nb.x, nb.z));
        }
      }
    }
    return null;
  }

  _neighbors(x, z) {
    return [
      { x: x+1, z }, { x: x-1, z },
      { x, z: z+1 }, { x, z: z-1 }
    ].filter(n => this._map.isWalkable(n.x, n.z));
  }

  _adjacent(x, z) {
    return [
      { x: x+1, z }, { x: x-1, z },
      { x, z: z+1 }, { x, z: z-1 }
    ].filter(n => this._map.isWalkable(n.x, n.z));
  }

  _reconstruct(parent, endKey, startKey) {
    const path = [];
    let cur = endKey;
    while (cur && cur !== startKey) {
      const [x, z] = cur.split(',').map(Number);
      path.unshift({ x, z });
      cur = parent.get(cur);
    }
    return path;
  }
}

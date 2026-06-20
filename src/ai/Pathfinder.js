export class Pathfinder {
  constructor(tilemap) { this._map = tilemap; }

  find(sx, sz, gx, gz) {
    if (!this._map.isWalkable(gx, gz)) {
      const adj = this._adjacent(gx, gz);
      if (adj.length === 0) return null;
      ({ x: gx, z: gz } = adj[0]);
    }
    const key = (x, z) => `${x},${z}`;
    const h   = (x, z) => Math.abs(x - gx) + Math.abs(z - gz);
    const open = new Map(), closed = new Set(), g = new Map(), parent = new Map();
    const start = key(sx, sz);
    g.set(start, 0); open.set(start, h(sx, sz)); parent.set(start, null);
    while (open.size > 0) {
      let curKey = null, curF = Infinity;
      for (const [k, f] of open) { if (f < curF) { curF = f; curKey = k; } }
      open.delete(curKey); closed.add(curKey);
      const [cx, cz] = curKey.split(',').map(Number);
      if (cx === gx && cz === gz) return this._reconstruct(parent, curKey, start);
      for (const nb of this._neighbors(cx, cz)) {
        const nk = key(nb.x, nb.z);
        if (closed.has(nk)) continue;
        const tG = g.get(curKey) + 1;
        if (!g.has(nk) || tG < g.get(nk)) {
          g.set(nk, tG); parent.set(nk, curKey); open.set(nk, tG + h(nb.x, nb.z));
        }
      }
    }
    return null;
  }

  _neighbors(x, z) {
    return [{x:x+1,z},{x:x-1,z},{x,z:z+1},{x,z:z-1}].filter(n => this._map.isWalkable(n.x,n.z));
  }
  _adjacent(x, z) {
    return [{x:x+1,z},{x:x-1,z},{x,z:z+1},{x,z:z-1}].filter(n => this._map.isWalkable(n.x,n.z));
  }
  _reconstruct(parent, endKey, startKey) {
    const path = []; let cur = endKey;
    while (cur && cur !== startKey) {
      const [x,z] = cur.split(',').map(Number);
      path.unshift({x,z}); cur = parent.get(cur);
    }
    return path;
  }
}

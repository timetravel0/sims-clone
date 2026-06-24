import { describe, it, expect, beforeEach } from 'vitest';
import { WallManager } from '../src/world/WallManager.js';
import { TileMap }     from '../src/world/TileMap.js';
import { Pathfinder }  from '../src/ai/Pathfinder.js';

// Minimal THREE mock — WallManager only needs add/remove + Mesh construction
class FakeScene {
  add()    {}
  remove() {}
}

let scene, tileMap, wm;

beforeEach(() => {
  scene   = new FakeScene();
  tileMap = new TileMap(8, 8);
  wm      = new WallManager(scene, tileMap);
});

describe('WallManager', () => {
  it('placeWall: hasWall true, isPassable false', () => {
    wm.placeWall(2, 2, 3, 2);
    expect(wm.hasWall(2, 2, 3, 2)).toBe(true);
    expect(wm.isPassable(2, 2, 3, 2)).toBe(false);
  });

  it('placeDoor: hasDoor true, isPassable true', () => {
    wm.placeDoor(2, 2, 3, 2);
    expect(wm.hasDoor(2, 2, 3, 2)).toBe(true);
    expect(wm.isPassable(2, 2, 3, 2)).toBe(true);
  });

  it('placeDoor over wall replaces it', () => {
    wm.placeWall(2, 2, 3, 2);
    wm.placeDoor(2, 2, 3, 2);
    expect(wm.hasWall(2, 2, 3, 2)).toBe(false);
    expect(wm.hasDoor(2, 2, 3, 2)).toBe(true);
    expect(wm.isPassable(2, 2, 3, 2)).toBe(true);
  });

  it('removeEdge restores passability', () => {
    wm.placeWall(2, 2, 3, 2);
    wm.removeEdge(2, 2, 3, 2);
    expect(wm.hasWall(2, 2, 3, 2)).toBe(false);
    expect(wm.isPassable(2, 2, 3, 2)).toBe(true);
  });

  it('edgeKey is canonical regardless of direction', () => {
    wm.placeWall(3, 2, 2, 2); // reversed coords
    expect(wm.hasWall(2, 2, 3, 2)).toBe(true); // forward key works too
  });

  it('serialise/restore round-trip', () => {
    wm.placeWall(1, 1, 2, 1);
    wm.placeDoor(3, 3, 3, 4);
    const data = wm.serialise();
    const wm2  = new WallManager(scene, tileMap);
    wm2.restore(data);
    expect(wm2.hasWall(1, 1, 2, 1)).toBe(true);
    expect(wm2.hasDoor(3, 3, 3, 4)).toBe(true);
    expect(wm2.isPassable(1, 1, 2, 1)).toBe(false);
    expect(wm2.isPassable(3, 3, 3, 4)).toBe(true);
  });

  it('Pathfinder cannot cross wall, can cross door', () => {
    // Block the entire edge x=3↔x=4 across all walkable rows (z=1..6)
    for (let z = 1; z <= 6; z++) wm.placeWall(3, z, 4, z);

    const edgePassable = (x1, z1, x2, z2) => wm.isPassable(x1, z1, x2, z2);
    const pf = new Pathfinder(tileMap, null, edgePassable);

    // Path from (2,3) to (5,3) must cross the wall — should return null with pure wall
    const blocked = pf.find(2, 3, 5, 3);
    expect(blocked).toBeNull();

    // Place a door in the middle row
    wm.placeDoor(3, 3, 4, 3);
    const pf2    = new Pathfinder(tileMap, null, (x1, z1, x2, z2) => wm.isPassable(x1, z1, x2, z2));
    const routed = pf2.find(2, 3, 5, 3);
    expect(routed).not.toBeNull();
  });
});

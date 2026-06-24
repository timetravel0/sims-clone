import { describe, it, expect, beforeEach } from 'vitest';
import { World }         from '../src/world/World.js';
import { WallManager }   from '../src/world/WallManager.js';
import { LayoutPlanner } from '../src/world/LayoutPlanner.js';
import { AutonomousConstructionSystem } from '../src/systems/AutonomousConstructionSystem.js';

// WP4: when a room is built, LayoutPlanner relocates furniture that belongs in
// it (by roomTags) into the new interior — the sparse room becomes a real zone.

class FakeScene { add() {} remove() {} }
class FakeBudget {
  constructor(f) { this._f = f; }
  get funds() { return this._f; }
  debit(a) { if (a > this._f) return false; this._f -= a; return true; }
}

function makeGame() {
  const scene = new FakeScene();
  const world = new World(scene);
  world.wallManager = new WallManager(scene, world.tilemap);
  new LayoutPlanner(world); // subscribes to household:roomCreated
  return {
    world, wallManager: world.wallManager,
    budgetSystem: new FakeBudget(20000), clock: { day: 5 },
    sims: Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, _isVisitor: false })),
  };
}

describe('relocates furniture into a newly built room', () => {
  let game, sys, oldHeight;
  beforeEach(() => {
    game = makeGame();
    sys = new AutonomousConstructionSystem(game);
    oldHeight = game.world.tilemap.height;
  });

  const inPatch = (f) => f.gz >= oldHeight;

  it('a new bathroom pulls in a hygiene fixture (shower)', () => {
    const toiletsBefore = game.world.furniture.filter(f => f.id === 'toilet').length;
    expect(sys.build('bathroom')).toBe(true);

    // shower (roomTags:['bathroom']) is relocated into the new room
    expect(game.world.furniture.find(f => f.id === 'shower').gz).toBeGreaterThanOrEqual(oldHeight);
    // the anchor toilet is the only toilet in the patch — anchor function not piled
    expect(game.world.furniture.filter(f => f.id === 'toilet').length).toBe(toiletsBefore + 1);
    expect(game.world.furniture.filter(f => f.id === 'toilet' && inPatch(f)).length).toBe(1);
  });

  it('a new bedroom is furnished with bedroom-tagged items', () => {
    expect(sys.build('bedroom')).toBe(true);
    const relocated = game.world.furniture.filter(f => inPatch(f) && !/bed/.test(f.id));
    expect(relocated.length).toBeGreaterThan(0);                 // room got furnished
    expect(relocated.every(f => f.roomTags?.includes('bedroom'))).toBe(true); // only fitting items
    expect(game.world.furniture.filter(f => /bed/.test(f.id) && inPatch(f)).length).toBe(1); // no extra bed
  });

  it('never relocates more than the cap', () => {
    sys.build('bedroom');
    const relocated = game.world.furniture.filter(f => inPatch(f) && !/bed/.test(f.id));
    expect(relocated.length).toBeLessThanOrEqual(2);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { World }        from '../src/world/World.js';
import { WallManager }  from '../src/world/WallManager.js';
import { RoomDetector } from '../src/world/RoomDetector.js';
import { AutonomousConstructionSystem } from '../src/systems/AutonomousConstructionSystem.js';

class FakeScene { add() {} remove() {} }

class FakeBudget {
  constructor(funds) { this._f = funds; this.debits = []; }
  get funds() { return this._f; }
  debit(a, reason) { if (a > this._f) return false; this._f -= a; this.debits.push({ a, reason }); return true; }
}

function makeGame(funds = 20000, simCount = 5) {
  const scene = new FakeScene();
  const world = new World(scene);
  const wm = new WallManager(scene, world.tilemap);
  world.wallManager = wm;
  const rd = new RoomDetector(world.tilemap, wm);
  const sims = Array.from({ length: simCount }, (_, i) => ({ id: `s${i}`, _isVisitor: false }));
  return { world, wallManager: wm, roomDetector: rd, budgetSystem: new FakeBudget(funds), clock: { day: 5 }, sims };
}

describe('AutonomousConstructionSystem', () => {
  let game, sys;
  beforeEach(() => { game = makeGame(); sys = new AutonomousConstructionSystem(game); });

  it('detects a functional need when beds are insufficient', () => {
    expect(sys._needReason()).toBe('bedroom'); // 5 sims, 1 default bed
  });

  it('detects a bathroom need once beds are covered but baths are short', () => {
    // 5 sims; enough beds to cover sleeping (3 → 5 ≤ 6), but no bathroom fixtures.
    game.world.furniture = [{ id: 'bed_1' }, { id: 'bed_2' }, { id: 'bed_3' }];
    expect(sys._needReason()).toBe('bathroom');
  });

  it('build("bathroom") furnishes a toilet, not a bed', () => {
    const toilets0 = game.world.furniture.filter(f => /toilet/.test(f.id)).length;
    sys.build('bathroom');
    expect(game.world.furniture.filter(f => /toilet/.test(f.id)).length).toBe(toilets0 + 1);
  });

  it('build() grows the lot, debits land, adds a bed and creates a detected room', () => {
    const h0 = game.world.tilemap.height;
    const beds0 = game.world.furniture.filter(f => /bed/.test(f.id)).length;
    const rooms0 = game.roomDetector.analyse().length;

    expect(sys.build('bedroom')).toBe(true);

    expect(game.world.tilemap.height).toBeGreaterThan(h0);          // land expanded
    expect(game.budgetSystem.debits.some(d => d.reason === 'land_purchase')).toBe(true);
    expect(game.world.furniture.filter(f => /bed/.test(f.id)).length).toBe(beds0 + 1);
    expect(game.roomDetector.analyse().length).toBeGreaterThan(rooms0); // room recognised
    expect(sys.roomsBuilt).toBe(1);
  });

  it('the new room has a reachable door (passable edge on its top wall)', () => {
    sys.build('bedroom');
    const wm = game.wallManager;
    // The door sits on the top edge of the room; at least one such edge is passable.
    let doorFound = false;
    for (let x = 1; x < game.world.tilemap.width - 1; x++) {
      for (let z = 1; z < game.world.tilemap.height - 1; z++) {
        if (wm.hasDoor(x, z, x, z + 1)) doorFound = true;
      }
    }
    expect(doorFound).toBe(true);
  });

  it('respects the funds reserve (no build when broke)', () => {
    const poor = makeGame(1000);
    const s = new AutonomousConstructionSystem(poor);
    s._consider();
    expect(s.roomsBuilt).toBe(0);
  });

  it('serialise/restore round-trips build state', () => {
    sys.build('bedroom');
    const snap = sys.serialise();
    const fresh = new AutonomousConstructionSystem(makeGame());
    fresh.restore(snap);
    expect(fresh.roomsBuilt).toBe(1);
  });
});

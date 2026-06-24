import { bus } from '../core/EventBus.js';
import { craftCapFor } from './AutonomousShoppingSystem.js';

/**
 * AutonomousConstructionSystem — WP4 / Milestone 6.
 *
 * The household autonomously buys land and builds a new room when there is a
 * functional reason (currently: not enough beds for the household). Construction
 * is staged: expand the lot → enclose a room shell with WallManager edge-walls
 * and one door → furnish it. RoomDetector recognises the enclosed room, and the
 * expansion is replayed on load (World.serialiseExpansions), so the grown lot,
 * walls and furniture all survive save/load.
 *
 * Every build is gated by a clear reason, a funds reserve, a cooldown and a hard
 * cap — no silent, reasonless growth (roadmap hard rule #1).
 */
const LAND_COST          = 2500;
const RESERVE            = 5000;   // keep at least this much after building
const MAX_AUTO_ROOMS     = 3;
const BUILD_COOLDOWN_DAYS = 2;
const EXPAND_TILES       = 6;
const ROOM_W             = 6;
const ROOM_D             = 4;

export class AutonomousConstructionSystem {
  constructor(game) {
    this._game = game;
    this._roomsBuilt = 0;
    this._lastBuildDay = -Infinity;
    bus.on('clock:dayChanged', () => this._consider());
  }

  get roomsBuilt() { return this._roomsBuilt; }

  _consider() {
    const day = this._game.clock?.day ?? 0;
    const world = this._game.world;

    // Keep handcrafted clutter within its count cap every day — scrap the oldest
    // beyond it. Count-based, so it works regardless of WHERE the objects sit (a
    // global free-tile metric missed objects clustered in the house core) and
    // regardless of funds (scrapping is free), unlike buying land — which a
    // bankrupt household can't afford and which only appends tiles at the lot
    // edge, never reopening the original house. Also heals already-cluttered
    // saves on the next in-game day (2026-06-24 logs).
    this._declutterCrafted(craftCapFor(world));

    if (day - this._lastBuildDay < BUILD_COOLDOWN_DAYS) return;
    const budget = this._game.budgetSystem;
    if (!budget || budget.funds < RESERVE + LAND_COST) return;
    if (this._roomsBuilt >= MAX_AUTO_ROOMS) return;

    const reason = this._needReason();
    if (reason) this.build(reason);
  }

  /**
   * Scrap the oldest handcrafted (`custom_object_*`) furniture beyond `keep`,
   * skipping items in use/reserved. Free of charge — never depends on funds.
   */
  _declutterCrafted(keep) {
    const world = this._game.world;
    if (!world?.removeFurniture) return 0;
    let count = world.furniture.filter(f => String(f.id).startsWith('custom_object_')).length;
    if (count <= keep) return 0;
    const scrappable = world.furniture.filter(f =>
      String(f.id).startsWith('custom_object_') && !f.inUse && !f.reservedBy);
    let removed = 0;
    for (const f of scrappable) {
      if (count <= keep) break;
      if (world.removeFurniture(f.gx, f.gz)) { removed++; count--; }
    }
    if (removed) {
      this._game.roomDetector?.analyse?.();
      bus.emit('household:decluttered', { removed });
      bus.emit('story:entry', {
        text: `La famiglia ha rottamato ${removed} oggett${removed === 1 ? 'o' : 'i'} fatti a mano per liberare il passaggio.`,
        cat: 'family', category: 'family',
      });
    }
    return removed;
  }

  /** Returns a functional reason string, or null if no room is needed. */
  _needReason() {
    const sims = (this._game.sims ?? []).filter(s => !s._isVisitor);
    const furn = this._game.world?.furniture ?? [];
    const beds = furn.filter(f => /bed/.test(f.id)).length;
    if (sims.length > beds * 2) return 'bedroom';
    const baths = furn.filter(f => /toilet|shower/.test(f.id)).length;
    if (sims.length > baths * 3) return 'bathroom';
    return null;
  }

  /** Build a bedroom: expand the lot, enclose a room with a door, add a bed. */
  build(reason = 'bedroom') {
    // Guard here (not just in _consider) so any caller — e.g. HouseholdPlanner —
    // still respects the cap, cooldown and funds reserve.
    const day = this._game.clock?.day ?? 0;
    if (this._roomsBuilt >= MAX_AUTO_ROOMS) return false;
    if (day - this._lastBuildDay < BUILD_COOLDOWN_DAYS) return false;
    if ((this._game.budgetSystem?.funds ?? 0) < RESERVE + LAND_COST) return false;
    const world = this._game.world;
    const wm    = this._game.wallManager;
    if (!world || !wm) return false;

    const oldHeight = world.tilemap.height;
    if (!world.expandLot('bottom', EXPAND_TILES)) return false;
    this._game.budgetSystem?.debit?.(LAND_COST, 'land_purchase', { reason });

    // Room interior rectangle inside the new patch.
    const x0 = 2, x1 = Math.min(x0 + ROOM_W - 1, world.tilemap.width - 3);
    const z0 = oldHeight, z1 = z0 + ROOM_D - 1;
    const doorX = Math.floor((x0 + x1) / 2);

    // Enclose with edge-walls; leave one door on the top edge facing the house.
    for (let x = x0; x <= x1; x++) {
      if (x === doorX) wm.placeDoor(x, z0 - 1, x, z0);
      else             wm.placeWall(x, z0 - 1, x, z0);
      wm.placeWall(x, z1, x, z1 + 1);
    }
    for (let z = z0; z <= z1; z++) {
      wm.placeWall(x0 - 1, z, x0, z);
      wm.placeWall(x1, z, x1 + 1, z);
    }

    // Furnish the room centre per its function (bedroom → bed, bathroom → toilet).
    const bx = Math.floor((x0 + x1) / 2);
    const bz = Math.floor((z0 + z1) / 2);
    const furnish = reason === 'bathroom'
      ? { id: 'toilet', gx: bx, gz: bz, color: 0xf0f0e8, needTarget: 'bladder', restoreRate: 60 }
      : { id: 'bed',    gx: bx, gz: bz, color: 0x6b9ac4, needTarget: 'energy',  restoreRate: 30 };
    world.placeFurniture(furnish);

    this._roomsBuilt += 1;
    this._lastBuildDay = this._game.clock?.day ?? 0;
    this._game.roomDetector?.analyse?.();

    bus.emit('household:roomCreated', { reason, roomsBuilt: this._roomsBuilt, doorX, x0, x1, z0, z1 });
    bus.emit('story:entry', {
      text: `La famiglia ha acquistato terreno e costruito una nuova stanza (${reason}). −§${LAND_COST}`,
      cat: 'family', category: 'family',
    });
    return true;
  }

  serialise() { return { roomsBuilt: this._roomsBuilt, lastBuildDay: this._lastBuildDay }; }
  restore(d = {}) {
    this._roomsBuilt = d.roomsBuilt ?? 0;
    this._lastBuildDay = d.lastBuildDay ?? -Infinity;
  }
}

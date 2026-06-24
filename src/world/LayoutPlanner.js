/**
 * LayoutPlanner — spatial scoring + autonomous rearrangement.
 *
 * Usage (console / code):
 *   window._game.layoutPlanner.score()         → { total, zones, issues }
 *   window._game.layoutPlanner.suggestMoves()  → [{ objectId, from, to, reason, gain }]
 *   window._game.layoutPlanner.autoRearrange() → executes top valid suggestion
 *
 * Autonomous mode: call update(dt) each game tick (wired in Game.js).
 * Fires one move every AUTO_INTERVAL_TICKS game-minutes, only when score
 * gain exceeds MIN_GAIN and the move preserves path connectivity.
 */
import { bus } from '../core/EventBus.js';

// Zone definitions: each zone needs a set of function tags to be happy.
const ZONES = {
  bedroom:  { required: ['sleep'],              bonus: ['study'],           avoidNear: ['toilet'] },
  bathroom: { required: ['toilet', 'hygiene'],  bonus: [],                  avoidNear: ['food_storage', 'eat'] },
  kitchen:  { required: ['food_storage'],        bonus: ['eat'],             avoidNear: ['toilet', 'hygiene'] },
  dining:   { required: ['eat'],                bonus: ['food_storage'],    avoidNear: ['toilet', 'hygiene'] },
  living:   { required: ['relax', 'entertainment'], bonus: ['social'],      avoidNear: ['toilet'] },
  study:    { required: ['study'],              bonus: ['decor'],           avoidNear: ['toilet', 'hygiene'] },
};

const CLUSTER_RADIUS  = 3;     // tiles — objects this close are "near"
const AUTO_INTERVAL   = 3600;  // ~1 game-hour of game-seconds between moves
const MIN_GAIN        = 5;     // minimum score gain to justify a move
const MAX_FURNISH     = 2;     // items relocated into a freshly-built room
// The function tag the construction system already satisfied with the room's
// anchor object — we don't pull more of the same (no piling beds in a bedroom).
const ANCHOR_TAG      = { bedroom: 'sleep', bathroom: 'toilet' };

export class LayoutPlanner {
  constructor(world) {
    this._world  = world;
    this._timer  = AUTO_INTERVAL; // start with a full delay so new games settle
    bus.on('household:roomCreated', e => this.furnishNewRoom(e));
  }

  /**
   * WP4: make a freshly-built room a real functional zone by relocating
   * existing furniture that belongs in it (by roomTags) into its interior.
   * Skips the anchor's own function (so a new bedroom doesn't accumulate beds),
   * in-use items, and any move that would break path connectivity.
   */
  furnishNewRoom({ reason, x0, x1, z0, z1 } = {}) {
    if (![x0, x1, z0, z1].every(Number.isFinite)) return 0;
    const skipTag = ANCHOR_TAG[reason];
    const inRect = (f) => f.gx >= x0 && f.gx <= x1 && f.gz >= z0 && f.gz <= z1;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;

    const candidates = (this._world.furniture ?? [])
      .filter(f => f.roomTags?.includes(reason) && !inRect(f)
        && !f.inUse && !f.reservedBy
        && !(skipTag && f.functionTags?.includes(skipTag)))
      // nearest to the new room first — shortest, least disruptive relocation
      .sort((a, b) => this._distance(a, { gx: cx, gz: cz }) - this._distance(b, { gx: cx, gz: cz }));

    let moved = 0;
    for (const obj of candidates) {
      if (moved >= MAX_FURNISH) break;
      const target = this._freeTileInRect(x0, x1, z0, z1, obj);
      if (!target) break; // room full
      const from = { gx: obj.gx, gz: obj.gz };
      if (!this._connectivityOk(from, target)) continue;
      if (!this._world.moveFurniture(from.gx, from.gz, target.gx, target.gz)) continue;
      moved++;
      bus.emit('household:furnitureMoved', {
        objectId: obj.id, label: obj.label ?? obj.id,
        from, to: target, reason: `furnish new ${reason}`, gain: 0,
      });
      bus.emit('story:entry', {
        text: `La famiglia arreda la nuova stanza: ${obj.label ?? obj.id} spostato nel nuovo ${reason}.`,
        cat: 'household',
      });
    }
    return moved;
  }

  // ── Public ─────────────────────────────────────────────────────────────────

  // ── Autonomous loop ────────────────────────────────────────────────────────

  /** Called each frame with scaled game-time seconds (same contract as other systems). */
  update(dt) {
    this._timer -= dt;
    if (this._timer > 0) return;
    this._timer = AUTO_INTERVAL;
    this.autoRearrange();
  }

  /**
   * Executes the best valid suggestion.
   * A suggestion is valid when: furniture is free, target tile is walkable,
   * move improves score by MIN_GAIN, and path connectivity is preserved.
   * Emits household:furnitureMoved on success.
   */
  autoRearrange() {
    const suggestions = this.suggestMoves();
    for (const s of suggestions) {
      if (s.gain < MIN_GAIN) break; // sorted descending — stop early
      const furniture = this._world.furniture ?? [];
      const obj = furniture.find(f => f.id === s.objectId && f.gx === s.from.gx && f.gz === s.from.gz);
      if (!obj || obj.inUse || obj.reservedBy) continue;

      if (!this._connectivityOk(s.from, s.to)) continue;

      const ok = this._world.moveFurniture(s.from.gx, s.from.gz, s.to.gx, s.to.gz);
      if (!ok) continue;

      bus.emit('household:furnitureMoved', {
        objectId: obj.id, label: obj.label ?? obj.id,
        from: s.from, to: s.to, reason: s.reason, gain: s.gain,
      });
      bus.emit('story:entry', {
        text: `Il nucleo riorganizza la casa: ${obj.label ?? obj.id} spostato (${s.reason}).`,
        cat: 'household',
      });
      return true;
    }
    return false;
  }

  // ── Public ─────────────────────────────────────────────────────────────────

  /** Returns a full layout score with per-zone breakdowns and issue list. */
  score() {
    const furniture = this._world.furniture ?? [];
    const zones     = {};
    const issues    = [];

    for (const [zoneName, def] of Object.entries(ZONES)) {
      const zoneObjects = furniture.filter(f => this._hasAnyTag(f, def.required));
      if (zoneObjects.length === 0) continue;

      let zoneScore = 0;

      // Bonus: bonus-tagged objects nearby
      for (const obj of zoneObjects) {
        for (const bonusTag of def.bonus) {
          const nearest = this._nearestWithTag(obj, bonusTag, furniture);
          if (nearest && this._distance(obj, nearest) <= CLUSTER_RADIUS) zoneScore += 10;
          else if (nearest) {
            zoneScore += 2;
            issues.push({ type: 'spread', zoneName, objectId: nearest.id, dist: Math.round(this._distance(obj, nearest)) });
          }
        }
        // Penalty: avoid-near violations
        for (const avoidTag of def.avoidNear) {
          const bad = this._nearestWithTag(obj, avoidTag, furniture);
          if (bad && this._distance(obj, bad) <= CLUSTER_RADIUS) {
            zoneScore -= 15;
            issues.push({ type: 'proximity_violation', zoneName, objectId: obj.id, nearId: bad.id });
          }
        }
      }

      // Cluster coherence: zone objects near each other
      if (zoneObjects.length >= 2) {
        const avgDist = this._averageClusterDist(zoneObjects);
        if (avgDist <= CLUSTER_RADIUS) zoneScore += 20;
        else {
          zoneScore -= Math.round(avgDist - CLUSTER_RADIUS) * 3;
          issues.push({ type: 'scattered', zoneName, avgDist: Math.round(avgDist) });
        }
      }

      zones[zoneName] = { score: zoneScore, objectCount: zoneObjects.length };
    }

    const total = Object.values(zones).reduce((s, z) => s + z.score, 0);
    return { total, zones, issues };
  }

  /**
   * Returns a list of suggested furniture moves.
   * Each suggestion: { objectId, label, from:{gx,gz}, to:{gx,gz}, reason, gain }
   * Does NOT execute moves.
   */
  suggestMoves() {
    const suggestions = [];
    const furniture = this._world.furniture ?? [];
    const currentScore = this.score().total;

    for (const obj of furniture) {
      if (!obj.functionTags?.length) continue;
      // Find the nearest same-function sibling — if far, suggest moving closer
      const sameZoneObjs = furniture.filter(f => f !== obj && this._sharesTag(f, obj));
      if (sameZoneObjs.length === 0) continue;

      const nearest = sameZoneObjs.reduce((best, f) =>
        this._distance(obj, f) < this._distance(obj, best) ? f : best);

      const dist = this._distance(obj, nearest);
      if (dist <= CLUSTER_RADIUS + 1) continue; // already close enough

      // Suggest a target tile adjacent to the nearest sibling
      const target = this._freeTileNear(nearest.gx, nearest.gz, obj);
      if (!target) continue;

      const gain = Math.round((dist - CLUSTER_RADIUS) * 5);
      suggestions.push({
        objectId: obj.id,
        label:    obj.label ?? obj.id,
        from:     { gx: obj.gx, gz: obj.gz },
        to:       target,
        reason:   `move closer to ${nearest.label ?? nearest.id} (${Math.round(dist)} tiles away)`,
        gain,
      });
    }

    // Sort by estimated gain descending
    return suggestions.sort((a, b) => b.gain - a.gain);
  }

  // ── Internal ─────────────────────────────────────────────────────────────────

  /**
   * BFS reachability check: temporarily apply the move and verify all
   * furniture tiles are still reachable from the entry point.
   * Reverts the tilemap change before returning.
   */
  _connectivityOk(from, to) {
    const tilemap = this._world.tilemap;
    const { TILE } = this._world.constructor._TILE_CONSTS ?? {};
    // Apply move temporarily
    tilemap.set(from.gx, from.gz, 0 /* FLOOR */);
    tilemap.set(to.gx,   to.gz,   2 /* FURNITURE */);

    const reachable = this._bfsReachable();

    // Revert
    tilemap.set(from.gx, from.gz, 2 /* FURNITURE */);
    tilemap.set(to.gx,   to.gz,   0 /* FLOOR */);

    // All furniture that was reachable-adjacent must still be reachable
    const furniture = this._world.furniture ?? [];
    for (const f of furniture) {
      if (f.gx === from.gx && f.gz === from.gz) continue; // the moved object
      // Check that at least one adjacent tile to the furniture is reachable
      const adj = [[f.gx+1,f.gz],[f.gx-1,f.gz],[f.gx,f.gz+1],[f.gx,f.gz-1]];
      if (!adj.some(([x,z]) => reachable.has(`${x},${z}`))) return false;
    }
    return true;
  }

  /** BFS from entry point over tiles that are walkable after the temp move. */
  _bfsReachable() {
    const tilemap = this._world.tilemap;
    const entry   = this._world.entryPoints?.[0] ?? { gx: 1, gz: 1 };
    const sx = entry.spawnGx ?? entry.gx ?? 1;
    const sz = entry.insideGz ?? entry.gz ?? 1;
    const visited = new Set();
    const queue   = [[sx, sz]];
    visited.add(`${sx},${sz}`);
    while (queue.length) {
      const [x, z] = queue.shift();
      for (const [nx, nz] of [[x+1,z],[x-1,z],[x,z+1],[x,z-1]]) {
        const k = `${nx},${nz}`;
        if (visited.has(k)) continue;
        if (!tilemap.isWalkable(nx, nz)) continue;
        visited.add(k);
        queue.push([nx, nz]);
      }
    }
    return visited;
  }

  _hasAnyTag(obj, tags) {
    return tags.some(t => obj.functionTags?.includes(t));
  }

  _sharesTag(a, b) {
    return a.functionTags?.some(t => b.functionTags?.includes(t));
  }

  _nearestWithTag(origin, tag, furniture) {
    let best = null, bestD = Infinity;
    for (const f of furniture) {
      if (f === origin || !f.functionTags?.includes(tag)) continue;
      const d = this._distance(origin, f);
      if (d < bestD) { best = f; bestD = d; }
    }
    return best;
  }

  _distance(a, b) {
    const dx = (a.gx ?? 0) - (b.gx ?? 0);
    const dz = (a.gz ?? 0) - (b.gz ?? 0);
    return Math.sqrt(dx * dx + dz * dz);
  }

  _averageClusterDist(objects) {
    let sum = 0, count = 0;
    for (let i = 0; i < objects.length; i++)
      for (let j = i + 1; j < objects.length; j++) {
        sum += this._distance(objects[i], objects[j]);
        count++;
      }
    return count ? sum / count : 0;
  }

  /** First walkable, unoccupied tile inside the room rectangle. */
  _freeTileInRect(x0, x1, z0, z1, excludeObj) {
    const tilemap = this._world.tilemap;
    const furniture = this._world.furniture ?? [];
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (!tilemap?.isWalkable(x, z)) continue;
        if (furniture.some(f => f !== excludeObj && f.gx === x && f.gz === z)) continue;
        return { gx: x, gz: z };
      }
    }
    return null;
  }

  _freeTileNear(gx, gz, excludeObj) {
    const tilemap = this._world.tilemap;
    for (let r = 1; r <= 4; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue; // only ring perimeter
          const nx = gx + dx, nz = gz + dz;
          if (!tilemap?.isWalkable(nx, nz)) continue;
          const occupied = (this._world.furniture ?? []).some(f => f !== excludeObj && f.gx === nx && f.gz === nz);
          if (!occupied) return { gx: nx, gz: nz };
        }
      }
    }
    return null;
  }
}

/**
 * SessionLogger — persistent diagnostic log for interactive sessions.
 *
 * Stores a rolling buffer of structured events in localStorage.
 * Access via window._game.sessionLog or console:
 *
 *   _game.sessionLog.export()       → downloads sims-log.json
 *   _game.sessionLog.tail(20)       → returns last 20 events
 *   _game.sessionLog.summary()      → text summary of what happened
 *   _game.sessionLog.clear()        → wipe stored log
 */

import { bus } from '../core/EventBus.js';

const STORAGE_KEY  = 'sims-session-log';
const MAX_EVENTS   = 3000;
const SNAPSHOT_INTERVAL = 60; // game-ticks between need snapshots

const WATCHED_EVENTS = [
  'story:entry',
  'sim:died',
  'sim:death',
  'budget:insufficient',
  'budget:changed',
  'food:eatAborted',
  'health:starvationProgressed',
  'career:promoted',
  'career:fired',
  'family:childBorn',
  'romance:moveInAccepted',
  'household:furnitureMoved',
  'skill:levelUp',
];

export class SessionLogger {
  constructor(game) {
    this._game   = game;
    this._events = this._load();
    this._snapshotTimer = 0;
    this._session = Date.now();

    // Record session start
    this._push('session:start', {
      ts: new Date().toISOString(),
      budget: game.budgetSystem?.funds,
      sims: game.sims?.map(s => ({ id: s.id, name: s.name })),
    });

    for (const type of WATCHED_EVENTS) {
      bus.on(type, payload => {
        if (this._isHHEvent(type, payload)) this._push(type, payload);
      });
    }
  }

  // ── Called from game loop ─────────────────────────────────────────────────

  update(dt) {
    this._snapshotTimer += 1; // count game-ticks
    if (this._snapshotTimer < SNAPSHOT_INTERVAL) return;
    this._snapshotTimer = 0;
    this._takeNeedsSnapshot();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Download the log as sims-log.json */
  export() {
    const seen = new WeakSet();
    const data = JSON.stringify({ session: this._session, events: this._events }, (_, v) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return undefined;
        seen.add(v);
      }
      return v;
    }, 2);
    const blob   = new Blob([data], { type: 'application/json' });
    const url    = URL.createObjectURL(blob);
    const a      = document.createElement('a');
    a.href       = url;
    a.download   = `sims-log-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /** Return last N events (default 50) */
  tail(n = 50) { return this._events.slice(-n); }

  /** Human-readable summary */
  summary() {
    const ev = this._events;
    const deaths   = ev.filter(e => e.t === 'sim:died' || e.t === 'sim:death');
    const starves  = ev.filter(e => e.t === 'health:starvationProgressed');
    const aborts   = ev.filter(e => e.t === 'food:eatAborted');
    const insuff   = ev.filter(e => e.t === 'budget:insufficient');
    const snap     = ev.filter(e => e.t === 'sim:needsSnapshot');

    const lines = [
      `Session events: ${ev.length}`,
      `Deaths: ${deaths.length}${deaths.map(d => ` (${d.p.personName ?? d.p.simName}, cause: ${d.p.cause})`).join('')}`,
      `Starvation cycles logged: ${starves.length}`,
      `Eat aborted: ${aborts.length}${aborts.length ? ' — reasons: ' + [...new Set(aborts.map(a => a.p.reason))].join(', ') : ''}`,
      `Budget insufficient: ${insuff.length}${insuff.length ? ` (needed: §${insuff.map(i=>i.p.needed).join(', §')})` : ''}`,
      `Need snapshots: ${snap.length}`,
    ];

    if (starves.length) {
      const last = starves[starves.length - 1];
      lines.push(`Last starvation: ${last.p.simName} — cycle ${last.p.cycles}/${last.p.maxCycles}, hunger=${last.p.hunger?.toFixed(1)}, budget=§${last.p.budget}`);
    }
    if (aborts.length) {
      const last = aborts[aborts.length - 1];
      lines.push(`Last eat abort: ${last.p.simName} — ${last.p.reason}, hunger=${last.p.hunger?.toFixed(1)}, budget=§${last.p.budget}`);
    }

    return lines.join('\n');
  }

  clear() {
    this._events = [];
    this._save();
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  // Returns true if the event concerns a household member (or is household-level).
  _isHH(simId) {
    if (!simId) return false;
    return this._game?.population?.isHouseholdMember?.(simId) ?? false;
  }

  _isHHEvent(type, p) {
    // Household-level events — always relevant
    const alwaysShow = new Set([
      'session:start', 'budget:insufficient', 'budget:changed',
      'household:furnitureMoved', 'family:childBorn', 'romance:moveInAccepted',
    ]);
    if (alwaysShow.has(type)) return true;

    // Extract the sim ID(s) from the payload
    const ids = [
      p?.simId, p?.personId,
      p?.sim?.id, p?.simA?.id, p?.simB?.id,
      p?.idA, p?.idB,
    ].filter(Boolean);

    if (ids.length === 0) return true;  // no sim ID → assume household-level
    return ids.some(id => this._isHH(id));
  }

  _sanitize(v, depth = 0) {
    if (v === null || v === undefined) return v;
    if (typeof v !== 'object') return v;
    if (depth > 2) return undefined;
    // Collapse Sim/entity objects to a plain id+name stub
    if (v.id !== undefined && v.name !== undefined && v.needs !== undefined) return { id: v.id, name: v.name };
    if (Array.isArray(v)) return v.map(i => this._sanitize(i, depth + 1)).filter(i => i !== undefined);
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      const s = this._sanitize(val, depth + 1);
      if (s !== undefined) out[k] = s;
    }
    return out;
  }

  _push(type, payload) {
    const gameTick = this._game?.tick ?? 0;
    const hour     = this._game?.clock?.hour;
    this._events.push({ t: type, tick: gameTick, hour: hour ? +hour.toFixed(1) : undefined, p: this._sanitize(payload) });
    if (this._events.length > MAX_EVENTS) this._events.splice(0, this._events.length - MAX_EVENTS);
    this._save();
  }

  _takeNeedsSnapshot() {
    const sims = (this._game?.sims ?? []).filter(s => !s._isVisitor);
    const snap = sims.map(s => ({
      id:   s.id,
      name: s.name,
      hunger:  +(s.needs?.get?.('hunger')  ?? 0).toFixed(1),
      energy:  +(s.needs?.get?.('energy')  ?? 0).toFixed(1),
      hygiene: +(s.needs?.get?.('hygiene') ?? 0).toFixed(1),
      bladder: +(s.needs?.get?.('bladder') ?? 0).toFixed(1),
      social:  +(s.needs?.get?.('social')  ?? 0).toFixed(1),
      action:  s.brain?._queue?._current?.label ?? null,
    }));
    const budget = this._game?.budgetSystem?.funds;
    this._push('sim:needsSnapshot', { sims: snap, budget });
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  _save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this._events)); } catch {}
  }
}

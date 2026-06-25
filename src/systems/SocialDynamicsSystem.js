import { bus } from '../core/EventBus.js';
import { DIMENSIONS, DRIFT, INTERACTIONS } from '../config/interactions.js';

/**
 * SocialDynamicsSystem — Social Simulation Core 2.0
 *
 * Replaces the single scalar "score" with a richer, DIRECTIONAL relationship
 * model. For each ordered pair (from → to) we track how `from` feels about `to`
 * across eight dimensions (0–100):
 *
 *   trust        — reliability / willingness to be vulnerable
 *   affection    — warmth, liking
 *   respect       — admiration of competence/character
 *   attraction   — romantic/physical pull
 *   resentment   — accumulated grievance
 *   fear         — intimidation / avoidance pressure
 *   familiarity  — how well they know each other
 *   dependency   — reliance for needs/help
 *
 * The system is fed by bus events (social:interaction, life:event,
 * goal:completed/failed, relationship:romance), applies a slow passive drift
 * every tick, and offers explainRelation() for human-readable read-outs.
 *
 * Coexists with the legacy SocialManager (scalar score/familiarity) and
 * RelationshipGraph (typed edges) — all three are updated from the same
 * social:interaction event. This system is the high-resolution one.
 *
 * Serialisable via serialise()/restore().
 */

export { DIMENSIONS, INTERACTIONS };

// Generic fallback applied when a consent-gated interaction is refused.
// ponytail: a polite "no" used to breed resentment 4 / affection -3, which —
// combined with ~50% refusals — made every social attempt net-negative and kept
// affinity pinned near 0. Softened so rejection stings lightly, not poisons.
const DEFAULT_REJECT = { ab: { resentment: 1, affection: -1 }, ba: { trust: -1 } };
const FRICTION_INTERVAL = 120;

function clamp(v) { return Math.max(0, Math.min(100, v)); }

export class SocialDynamicsSystem {
  constructor(sims = []) {
    this._sims = sims;
    /** @type {Map<string, Record<string, number>>} "from->to" → dims */
    this._rel = new Map();
    /** @type {Map<string, number>} "from->to:type" → remaining cooldown (sim-seconds) */
    this._cooldowns = new Map();
    this._frictionTimer = FRICTION_INTERVAL;
    this._register();
  }

  // ── Access ────────────────────────────────────────────────────────────────

  _key(from, to) { return `${from}->${to}`; }

  /** Directional dims from→to (created lazily). */
  get(from, to) {
    const k = this._key(from, to);
    if (!this._rel.has(k)) {
      const d = {};
      for (const dim of DIMENSIONS) d[dim] = 0;
      this._rel.set(k, d);
    }
    return this._rel.get(k);
  }

  snapshot(from, to) { return { ...this.get(from, to) }; }

  /** Net affinity in [-100,100]: warm dims minus cold ones. */
  affinity(from, to) {
    const d = this.get(from, to);
    // ponytail: familiarity (built by every positive interaction) now feeds
    // affinity. Without it, two Sims could chat 50 times — accumulating huge
    // familiarity — and stay at affinity 0, so relationships never warmed up.
    return clamp(d.trust * 0.3 + d.affection * 0.4 + d.respect * 0.3 + d.familiarity * 0.1)
      - (d.resentment + d.fear * 0.6);
  }

  /**
   * Reputation: average of how others perceive this Sim.
   * Returns value in [-100, 100]. Uses existing relationship data — no extra storage.
   */
  getReputation(simId) {
    let sum = 0, count = 0;
    for (const [key, d] of this._rel) {
      if (!key.endsWith(`->${simId}`)) continue;
      sum += d.respect * 0.4 + d.affection * 0.3 - d.resentment * 0.3;
      count++;
    }
    return count ? sum / count : 0;
  }

  // ── Interaction effects ─────────────────────────────────────────────────────

  /** Apply a catalogue interaction's deltas to both directions. */
  applyInteraction(actorId, targetId, type, accepted = true) {
    const def = INTERACTIONS[type];
    if (!def || !actorId || !targetId || actorId === targetId) return;
    const eff = accepted ? def.accept : (def.reject ?? DEFAULT_REJECT);
    if (eff?.ab) this._apply(actorId, targetId, eff.ab);
    if (eff?.ba) this._apply(targetId, actorId, eff.ba);
  }

  _apply(from, to, deltas) {
    const d = this.get(from, to);
    for (const [dim, amt] of Object.entries(deltas)) {
      if (dim in d) d[dim] = clamp(d[dim] + amt);
    }
    bus.emit('socialdynamics:changed', { from, to });
  }

  // ── Cooldowns (avoid interaction spam per pair+type) ────────────────────────

  onCooldown(actorId, targetId, type) {
    return (this._cooldowns.get(`${actorId}->${targetId}:${type}`) ?? 0) > 0;
  }

  markCooldown(actorId, targetId, type) {
    const cd = INTERACTIONS[type]?.cooldown ?? 12;
    this._cooldowns.set(`${actorId}->${targetId}:${type}`, cd);
  }

  /** Acceptance modifier (additive) the target applies when actor initiates. */
  acceptanceModifier(targetId, actorId, type, ctx = {}) {
    const ba = this.get(targetId, actorId);   // how target feels about actor
    let mod = ba.affection * 0.4 + ba.trust * 0.3 + ba.respect * 0.1
            - ba.resentment * 0.6 - ba.fear * 0.2;
    switch (type) {
      case 'apologize':  mod += 30 + ba.affection * 0.3; break;
      case 'forgive':    mod += 45; break;
      case 'comfort':    mod += 25; break;
      case 'offer_help': mod += 30; break;
      case 'ask_help':   mod += 10 - ba.resentment * 0.3; break;
      case 'flirt':      mod += -10 + ba.attraction * 0.7 + ba.affection * 0.2; break;
      case 'hug':        mod += 5; break;
      default: break;
    }
    return mod;
  }

  // ── Requirements & motive ───────────────────────────────────────────────────

  meetsRequirements(actorId, targetId, type, ctx = {}) {
    const def = INTERACTIONS[type];
    if (!def) return false;
    if (!def.requires) return true;
    const s = { ab: this.get(actorId, targetId), ba: this.get(targetId, actorId) };
    return !!def.requires(s, ctx);
  }

  /** A short, human label for why the actor is acting this way. */
  dominantMotive(actorId, targetId, ctx = {}) {
    const ab = this.get(actorId, targetId);
    const ranked = [
      ['resentment', ab.resentment],
      ['affection',  ab.affection],
      ['attraction', ab.attraction],
      ['fear',       ab.fear],
      ['trust',      ab.trust],
      ['dependency', ab.dependency],
    ].sort((a, b) => b[1] - a[1]);
    if (ranked[0][1] < 8) {
      if ((ctx.actorNeeds?.social ?? 100) < 35) return 'loneliness';
      return 'curiosity';
    }
    return ranked[0][0];
  }

  // ── Tick: drift + cooldowns ─────────────────────────────────────────────────

  update(dt) {
    if (dt <= 0) return;
    for (const d of this._rel.values()) {
      for (const dim of DIMENSIONS) {
        const rate = DRIFT[dim] ?? 0;
        if (rate < 0 && d[dim] > 0)      d[dim] = Math.max(0, d[dim] + rate * dt);
        else if (rate > 0)               d[dim] = clamp(d[dim] + rate * dt);
      }
    }
    this._frictionTimer -= dt;
    if (this._frictionTimer <= 0) {
      this._frictionTimer = FRICTION_INTERVAL;
      this._applyAmbientFriction();
    }
    for (const [k, v] of this._cooldowns) {
      const next = v - dt;
      if (next <= 0) this._cooldowns.delete(k); else this._cooldowns.set(k, next);
    }
  }

  _applyAmbientFriction() {
    const active = this._sims.filter(s => !s._atWork && !s._outing && !s._isVisitor);
    for (const a of active) {
      const needs = a.needs?.getAll?.() ?? {};
      const pressure = Math.max(0, 32 - (needs.social ?? 100), 28 - (needs.fun ?? 100), 28 - (needs.comfort ?? 100)) / 32;
      const prickly = Math.max(0, -(a.personality?.nice ?? 0)) + Math.max(0, a.personality?.neurotic ?? 0) * 0.35;
      if (pressure <= 0 && prickly <= 0.2) continue;
      for (const b of active) {
        if (a === b) continue;
        const distance = Math.hypot((a.worldX ?? a.gx) - (b.worldX ?? b.gx), (a.worldZ ?? a.gz) - (b.worldZ ?? b.gz));
        if (distance > 5) continue;
        const amount = Math.min(3.5, pressure * 2.2 + prickly * 0.7);
        if (amount > 0.6) this._apply(a.id, b.id, { resentment: amount, affection: -amount * 0.25 });
      }
    }
  }

  // ── Human-readable explanation ───────────────────────────────────────────────

  /**
   * Rich relationship read-out for the Lab dashboards. Returns an OBJECT
   * { fromName, toName, label, affinity, summary, dims } — the dashboards render
   * `dims` as bars and show label/affinity/summary. (Previously returned a bare
   * string, which made the Lab "Relationship" tab crash on `ex.dims.trust`.)
   */
  explainRelation(fromId, toId) {
    const d = this.get(fromId, toId);
    const fromName = this._name(fromId), toName = this._name(toId);
    const reasons = [];
    const note = (cond, text) => { if (cond) reasons.push(text); };

    note(d.trust    >= 50, `trusts ${toName} (${Math.round(d.trust)})`);
    note(d.trust    <  15 && d.familiarity > 20, `hasn't built much trust (${Math.round(d.trust)})`);
    note(d.affection>= 50, `is fond of ${toName} (${Math.round(d.affection)})`);
    note(d.respect  >= 50, `respects ${toName} (${Math.round(d.respect)})`);
    note(d.attraction>=40, `is attracted to ${toName} (${Math.round(d.attraction)})`);
    note(d.resentment>=25, `resents ${toName} (${Math.round(d.resentment)})`);
    note(d.fear     >= 25, `is wary of ${toName} (${Math.round(d.fear)})`);
    note(d.dependency>=40, `leans on ${toName} for support (${Math.round(d.dependency)})`);
    note(d.familiarity< 10, `barely knows ${toName}`);
    const summary = reasons.length ? reasons.join('; ') : `${fromName} feels neutral toward ${toName}`;

    const aff = Math.round(this.affinity(fromId, toId));
    const label = aff >= 60 ? 'Close' : aff >= 25 ? 'Friendly' : aff > -10 ? 'Neutral'
                : aff > -40 ? 'Tense' : 'Hostile';
    return { fromName, toName, label, affinity: aff, summary, dims: { ...d } };
  }

  _name(id) {
    // population is authoritative for off-lot people (relatives/neighbours/coworkers);
    // sims only holds on-lot Sims, so without this off-lot ids showed as raw p_<uuid>.
    return globalThis.window?._game?.population?.getPerson?.(id)?.name
        ?? this._sims.find(s => s.id === id)?.name
        ?? id;
  }

  serialise() {
    return {
      rel: [...this._rel.entries()],
      cooldowns: [...this._cooldowns.entries()],
      frictionTimer: this._frictionTimer,
    };
  }

  restore(data = {}) {
    this._rel = new Map(data.rel ?? []);
    this._cooldowns = new Map(data.cooldowns ?? []);
    this._frictionTimer = data.frictionTimer ?? FRICTION_INTERVAL;
  }

  _register() {
    bus.on('social:interaction', event => {
      if (event.socialDynamicsApplied) return;
      this.applyInteraction(event.idA, event.idB, event.type, event.accepted !== false);
      this.markCooldown(event.idA, event.idB, event.type);
    });

    bus.on('life:event', ({ simId, affectedIds = [], valence = 0 }) => {
      for (const other of affectedIds) {
        if (!simId || !other || simId === other) continue;
        if (valence >= 0) this._apply(other, simId, { affection: 4 * valence, trust: 2 * valence });
        else this._apply(other, simId, { resentment: Math.abs(valence) * 6, fear: Math.abs(valence) * 2 });
      }
    });

    bus.on('goal:completed', ({ simId, targetId, type }) => {
      if (targetId) this._apply(simId, targetId, { respect: 3, affection: type === 'support_family' ? 4 : 1 });
    });

    bus.on('goal:failed', ({ simId, targetId }) => {
      if (targetId) this._apply(targetId, simId, { resentment: 4, trust: -2 });
    });

    bus.on('relationship:romance', ({ idA, idB, amount = 4 }) => {
      this._apply(idA, idB, { attraction: amount, affection: amount * 0.4 });
      this._apply(idB, idA, { attraction: amount * 0.8, affection: amount * 0.3 });
    });
  }
}

import { bus } from '../core/EventBus.js';

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

export const DIMENSIONS = [
  'trust', 'affection', 'respect', 'attraction',
  'resentment', 'fear', 'familiarity', 'dependency',
];

// Passive drift per in-game second (relationships fade / grudges cool down).
// Negative = decays toward 0.
const DRIFT = {
  trust: -0.02, affection: -0.02, respect: -0.015, attraction: -0.03,
  resentment: -0.05, fear: -0.06, familiarity: -0.005, dependency: -0.04,
};

/**
 * Interaction catalogue — single source of truth for what each social act
 * REQUIRES, how likely it is to be ACCEPTED, and how it MOVES the relationship.
 *
 * effects.ab = deltas to actor→target dims; effects.ba = target→actor dims.
 * `needsConsent` interactions are gated by an acceptance check; the rest happen
 * unilaterally (you can't stop someone insulting or avoiding you).
 */
export const INTERACTIONS = {
  chat:        { label: 'Chat',        emoji: '💬', duration: 4, valence:  1, needsConsent: true,  cooldown: 12,
                 accept: { ab: { familiarity: 4, affection: 2, trust: 1 }, ba: { familiarity: 4, affection: 2, trust: 1 } } },
  joke:        { label: 'Joke',        emoji: '😄', duration: 4, valence:  1, needsConsent: true,  cooldown: 16,
                 accept: { ab: { affection: 3, familiarity: 3 }, ba: { affection: 4, familiarity: 3, respect: 1 } } },
  compliment:  { label: 'Compliment',  emoji: '🌟', duration: 4, valence:  1, needsConsent: true,  cooldown: 20,
                 accept: { ab: { affection: 2 }, ba: { affection: 5, trust: 2, respect: 1 } } },
  hug:         { label: 'Hug',         emoji: '🤗', duration: 5, valence:  1, needsConsent: true,  cooldown: 25,
                 requires: (s) => s.ba.affection >= 10 || s.ba.familiarity >= 25,
                 accept: { ab: { affection: 6, trust: 3 }, ba: { affection: 6, trust: 3, fear: -2 } } },
  argue:       { label: 'Argue',       emoji: '😠', duration: 5, valence: -1, needsConsent: false, cooldown: 18,
                 accept: { ab: { resentment: 8, trust: -4, affection: -3 }, ba: { resentment: 8, trust: -4, affection: -3 } } },
  insult:      { label: 'Insult',      emoji: '🤬', duration: 3, valence: -1, needsConsent: false, cooldown: 22,
                 accept: { ab: { resentment: 5, respect: -2 }, ba: { resentment: 12, fear: 4, trust: -6, affection: -6 } } },

  apologize:   { label: 'Apologize',   emoji: '🙏', duration: 4, valence:  1, needsConsent: true,  cooldown: 30,
                 requires: (s) => s.ba.resentment >= 10,
                 accept: { ab: { respect: 2, resentment: -4 }, ba: { resentment: -14, trust: 5, affection: 3, fear: -3 } } },
  forgive:     { label: 'Forgive',     emoji: '🕊️', duration: 4, valence:  1, needsConsent: true,  cooldown: 30,
                 requires: (s) => s.ab.resentment >= 10,
                 accept: { ab: { resentment: -16, affection: 4, trust: 3 }, ba: { affection: 3, respect: 3 } } },
  confront:    { label: 'Confront',    emoji: '⚡', duration: 5, valence: -1, needsConsent: false, cooldown: 24,
                 requires: (s) => s.ab.resentment >= 12,
                 accept: { ab: { resentment: -4, respect: 3 }, ba: { resentment: 6, fear: 3, respect: 2 } } },
  avoid:       { label: 'Avoid',       emoji: '🙈', duration: 2, valence: -1, needsConsent: false, cooldown: 20,
                 accept: { ab: { familiarity: -3, affection: -2 }, ba: { familiarity: -2, resentment: 2 } } },
  ask_help:    { label: 'Ask for help',emoji: '🆘', duration: 4, valence:  1, needsConsent: true,  cooldown: 28,
                 requires: (s, c) => c.actorNeedLow,
                 accept: { ab: { dependency: 6, trust: 3, affection: 2 }, ba: { respect: 1, affection: 2 } } },
  offer_help:  { label: 'Offer help',  emoji: '🤝', duration: 4, valence:  1, needsConsent: true,  cooldown: 26,
                 requires: (s, c) => c.targetNeedLow,
                 accept: { ab: { affection: 3, respect: 2 }, ba: { trust: 6, affection: 5, dependency: 4 } } },
  comfort:     { label: 'Comfort',     emoji: '🫂', duration: 5, valence:  1, needsConsent: true,  cooldown: 24,
                 requires: (s, c) => c.targetMoodLow,
                 accept: { ab: { affection: 4 }, ba: { trust: 7, affection: 6, fear: -4, resentment: -4 } } },
  gossip:      { label: 'Gossip',      emoji: '🗣️', duration: 4, valence:  1, needsConsent: false, cooldown: 18,
                 accept: { ab: { familiarity: 4, affection: 3, trust: 2 }, ba: { familiarity: 4, affection: 3, trust: 2 } } },
  flirt:       { label: 'Flirt',       emoji: '😉', duration: 4, valence:  1, needsConsent: true,  cooldown: 20,
                 requires: (s, c) => c.compatible && s.ab.attraction >= 4 || s.ab.affection >= 15,
                 accept: { ab: { attraction: 7, affection: 3 }, ba: { attraction: 6, affection: 3 } },
                 reject: { ab: { attraction: -5, resentment: 6, affection: -4 }, ba: { fear: 1 } } },
  reject_flirt:{ label: 'Reject flirt',emoji: '🚫', duration: 3, valence: -1, needsConsent: false, cooldown: 20,
                 accept: { ab: { attraction: -6, affection: -3 }, ba: { resentment: 5, affection: -4 } } },
};

// Generic fallback applied when a consent-gated interaction is refused.
const DEFAULT_REJECT = { ab: { resentment: 4, affection: -3 }, ba: { trust: -1 } };

function clamp(v) { return Math.max(0, Math.min(100, v)); }

export class SocialDynamicsSystem {
  constructor(sims = []) {
    this._sims = sims;
    /** @type {Map<string, Record<string, number>>} "from->to" → dims */
    this._rel = new Map();
    /** @type {Map<string, number>} "from->to:type" → remaining cooldown (sim-seconds) */
    this._cooldowns = new Map();
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
    return clamp(d.trust * 0.3 + d.affection * 0.4 + d.respect * 0.3) - (d.resentment + d.fear * 0.6);
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
    for (const [k, v] of this._cooldowns) {
      const next = v - dt;
      if (next <= 0) this._cooldowns.delete(k); else this._cooldowns.set(k, next);
    }
  }

  // ── Human-readable explanation ───────────────────────────────────────────────

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
    if (reasons.length === 0) reasons.push(`feels neutral toward ${toName}`);

    return {
      from: fromId, to: toId, fromName, toName,
      dims: { ...d },
      label: this._relationLabel(d),
      affinity: Math.round(this.affinity(fromId, toId)),
      summary: `${fromName} ${reasons.join(', ')}.`,
      reasons,
    };
  }

  _relationLabel(d) {
    if (d.resentment >= 45 && d.resentment > d.affection) return d.fear >= 30 ? 'Feared rival' : 'Rival';
    if (d.attraction >= 45 && d.affection >= 30)          return 'Romantic interest';
    if (d.affection  >= 60 && d.trust >= 45)              return 'Close friend';
    if (d.affection  >= 35)                                return 'Friend';
    if (d.fear       >= 35)                                return 'Intimidated by';
    if (d.familiarity< 12)                                 return 'Stranger';
    return 'Acquaintance';
  }

  // ── Listeners ────────────────────────────────────────────────────────────────

  _register() {
    bus.on('social:interaction', ({ idA, idB, type, accepted }) => {
      if (!idA || !idB || !type) return;
      this.applyInteraction(idA, idB, type, accepted !== false);
    });

    // A Sim's public win/loss colours how others regard them.
    bus.on('life:event', ({ simId, valence = 0 }) => {
      if (!simId) return;
      for (const other of this._sims) {
        if (other.id === simId) continue;
        const ba = this.get(other.id, simId);
        ba.respect = clamp(ba.respect + (valence > 0 ? 3 : -2));
        if (valence < 0) ba.affection = clamp(ba.affection + 1); // sympathy
      }
    });

    bus.on('goal:completed', ({ simId, goal }) => {
      if (goal?.targetId) this._apply(simId, goal.targetId, { affection: 4, trust: 3 });
    });
    bus.on('goal:failed', ({ simId, goal }) => {
      if (goal?.type === 'avoid_sim' && goal.targetId) this._apply(simId, goal.targetId, { resentment: 3 });
    });

    bus.on('relationship:romance', ({ idA, idB, amount = 8 }) => {
      if (!idA || !idB) return;
      this._apply(idA, idB, { attraction: amount, affection: amount * 0.5 });
      this._apply(idB, idA, { attraction: amount * 0.8, affection: amount * 0.4 });
    });
  }

  _name(id) { return this._sims.find(s => s.id === id)?.name ?? id; }

  // ── Serialisation ─────────────────────────────────────────────────────────────

  serialise() {
    const rel = {};
    for (const [k, v] of this._rel) rel[k] = { ...v };
    return { rel };
  }

  restore(data = {}) {
    this._rel.clear();
    this._cooldowns.clear();
    for (const [k, v] of Object.entries(data.rel ?? {})) {
      const d = {};
      for (const dim of DIMENSIONS) d[dim] = clamp(v[dim] ?? 0);
      this._rel.set(k, d);
    }
  }
}

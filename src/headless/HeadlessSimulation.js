import { SocialDynamicsSystem, INTERACTIONS } from '../systems/SocialDynamicsSystem.js';
import { SIM_DEFS, DEFAULT_EXTERNALS } from '../config/defaultPopulation.js';

const NEGATIVE = new Set(['argue', 'insult', 'confront', 'avoid', 'reject_flirt']);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export class HeadlessSimulation {
  constructor({ seed = 1, household = SIM_DEFS, externals = DEFAULT_EXTERNALS } = {}) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.tick = 0;
    this.clock = { day: 0, hour: 8 };
    this.people = [...household.map((p, i) => this._person(p, `h_${i + 1}`, 'household')),
                   ...externals.map((p, i) => this._person(p, `e_${i + 1}`, p.role ?? 'neighbor'))];
    this.socialDynamics = new SocialDynamicsSystem(this.people);
    this.events = [];
    this.relationshipSnapshots = [];
  }

  run({ ticks = 2000, snapshotEvery = 100 } = {}) {
    for (let i = 0; i < ticks; i++) {
      this.step();
      if (snapshotEvery > 0 && this.tick % snapshotEvery === 0) this.relationshipSnapshots.push(this.relationshipSnapshot());
    }
    return this.summary();
  }

  step() {
    this.tick += 1;
    this.clock.hour = (8 + this.tick / 60) % 24;
    this.clock.day = Math.floor((8 + this.tick / 60) / 24);
    this.socialDynamics.update(1);
    if (this.rng() < 0.45) this._socialInteraction();
    if (this.rng() < 0.015) this._visitEvent();
  }

  relationshipSnapshot() {
    const rows = [];
    for (const a of this.people) {
      for (const b of this.people) {
        if (a.id === b.id) continue;
        rows.push({
          tick: this.tick,
          fromId: a.id,
          toId: b.id,
          affinity: Math.round(this.socialDynamics.affinity(a.id, b.id)),
          dims: this.socialDynamics.snapshot(a.id, b.id),
        });
      }
    }
    return { tick: this.tick, rows };
  }

  summary() {
    const social = this.events.filter(e => e.type === 'social:interaction');
    const visits = this.events.filter(e => e.type === 'visitor:visitEnded');
    const negative = social.filter(e => NEGATIVE.has(e.interactionType)).length;
    const acceptedVisits = visits.filter(e => e.accepted).length;
    return {
      seed: this.seed,
      ticks: this.tick,
      events: this.events.length,
      socialInteractions: social.length,
      conflictRate: social.length ? +(negative / social.length).toFixed(3) : 0,
      totalVisits: visits.length,
      visitAcceptanceRate: visits.length ? +(acceptedVisits / visits.length).toFixed(3) : 0,
      relationshipSnapshots: this.relationshipSnapshots.length,
    };
  }

  _socialInteraction() {
    const actor = pick(this.rng, this.people);
    const targets = this.people.filter(p => p.id !== actor.id);
    const target = pick(this.rng, targets);
    const type = this._chooseInteraction(actor, target);
    const accepted = this._accepted(actor, target, type);
    const before = Math.round(this.socialDynamics.affinity(actor.id, target.id));
    this.socialDynamics.applyInteraction(actor.id, target.id, type, accepted);
    const after = Math.round(this.socialDynamics.affinity(actor.id, target.id));
    this.events.push({
      tick: this.tick,
      simDay: this.clock.day,
      simHour: this.clock.hour.toFixed(2),
      type: 'social:interaction',
      actorId: actor.id,
      targetId: target.id,
      actorName: actor.name,
      targetName: target.name,
      interactionType: type,
      accepted,
      relationshipBefore: before,
      relationshipAfter: after,
    });
  }

  _visitEvent() {
    const visitor = pick(this.rng, this.people.filter(p => p.role !== 'household'));
    const host = pick(this.rng, this.people.filter(p => p.role === 'household'));
    const aff = this.socialDynamics.affinity(host.id, visitor.id);
    const accepted = this.rng() < Math.max(0.1, Math.min(0.9, 0.55 + aff / 180));
    this.events.push({
      tick: this.tick,
      simDay: this.clock.day,
      simHour: this.clock.hour.toFixed(2),
      type: 'visitor:visitEnded',
      visitorId: visitor.id,
      visitorName: visitor.name,
      hostId: host.id,
      hostName: host.name,
      reason: visitor.role === 'relative' ? 'family_visit' : 'spontaneous_neighbor',
      state: 'returned_home',
      outcome: accepted ? 'accepted' : 'rejected',
      accepted,
      duration: accepted ? 60 + Math.floor(this.rng() * 180) : 0,
    });
  }

  _chooseInteraction(actor, target) {
    const ab = this.socialDynamics.snapshot(actor.id, target.id);
    const ba = this.socialDynamics.snapshot(target.id, actor.id);
    const ctx = { actorNeedLow: false, targetNeedLow: false, targetMoodLow: false, compatible: (ab.affection + ab.attraction) > 10 };
    const candidates = Object.entries(INTERACTIONS)
      .filter(([type]) => type !== 'reject_flirt')
      .filter(([type]) => this.socialDynamics.meetsRequirements(actor.id, target.id, type, ctx))
      .map(([type, def]) => {
        let weight = 4 + Math.max(0, def.valence ?? 0) * 2;
        if (['confront', 'avoid', 'insult', 'argue'].includes(type)) weight += ab.resentment * 0.25;
        if (type === 'apologize') weight += ba.resentment * 0.25;
        if (type === 'forgive') weight += ab.resentment * 0.2;
        if (type === 'flirt') weight += ab.attraction * 0.35;
        if (['chat', 'joke', 'compliment', 'gossip'].includes(type)) weight += Math.max(0, this.socialDynamics.affinity(actor.id, target.id)) * 0.03;
        return { type, weight: Math.max(0.1, weight) };
      });
    const total = candidates.reduce((s, c) => s + c.weight, 0);
    let r = this.rng() * total;
    for (const c of candidates) {
      r -= c.weight;
      if (r <= 0) return c.type;
    }
    return candidates[0]?.type ?? 'chat';
  }

  _accepted(actor, target, type) {
    const def = INTERACTIONS[type];
    if (!def?.needsConsent) return true;
    const mod = this.socialDynamics.acceptanceModifier(target.id, actor.id, type, {});
    return this.rng() < Math.max(0.05, Math.min(0.95, 0.55 + mod / 100));
  }

  _person(def, id, role) {
    return { id, name: def.name ?? id, role, personality: { ...(def.traits ?? {}) } };
  }
}

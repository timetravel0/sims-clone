import { bus }           from '../core/EventBus.js';
import { socialManager } from './SocialManager.js';

/**
 * DramaEngine — the heart of emergent storytelling.
 *
 * Runs on a timer and evaluates the social graph looking for
 * conditions that trigger dramatic events. Also introduces
 * random personality-driven incidents.
 *
 * Drama types:
 *   jealousy      — Sim A sees B interacting happily with C while A dislikes C
 *   betrayal      — Sim A (mean, score > 40 with B) gossips about B to C
 *   reconciliation— Two enemies (score < -30) haven't argued in 30s → cool down
 *   crush         — score > 65 + outgoing trait → emit crush event
 *   rivalry       — two Sims argue 3+ times → locked rivalry
 *   mood_spiral   — neurotic Sim in sad/miserable tier → extra need decay
 */
export class DramaEngine {
  constructor(game) {
    this._game        = game;
    this._timer       = 0;
    this._interval    = 8;  // check every 8 game-seconds
    this._argueCount  = new Map(); // 'A:B' → count
    this._rivalries   = new Set();
    this._crushes     = new Set();
    this._lastArgue   = new Map();

    // Track arguments
    bus.on('social:interaction', ({ nameA, nameB, type }) => {
      if (type === 'argue' || type === 'insult') {
        const k = [nameA, nameB].sort().join(':');
        this._argueCount.set(k, (this._argueCount.get(k) || 0) + 1);
        this._lastArgue.set(k, Date.now());
        if (this._argueCount.get(k) >= 3 && !this._rivalries.has(k)) {
          this._rivalries.add(k);
          const [a, b] = k.split(':');
          bus.emit('drama:event',           { type: 'rivalry',  names: [a, b] });
          bus.emit('relationship:milestone', { nameA: a, nameB: b, level: 'enemy' });
        }
      }
    });
  }

  update(dt) {
    this._timer += dt;
    if (this._timer < this._interval) return;
    this._timer = 0;
    const sims = this._game.sims;
    if (sims.length < 2) return;

    for (let i = 0; i < sims.length; i++) {
      const a = sims[i];
      for (let j = i + 1; j < sims.length; j++) {
        const b = sims[j];
        this._evaluatePair(a, b);
      }
    }

    // Mood spiral for neurotic Sims
    for (const sim of sims) {
      if (sim.personality.neurotic > 0.4 &&
         (sim.mood.tier === 'sad' || sim.mood.tier === 'miserable')) {
        // Extra decay on social & fun
        sim.needs.decay('social', 3 * dt);
        sim.needs.decay('fun',    2 * dt);
      }
    }
  }

  _evaluatePair(a, b) {
    const score = socialManager.score(a.id, b.id);
    const k     = [a.name, b.name].sort().join(':');

    // Crush: high score + outgoing personality
    if (score >= 65 && !this._crushes.has(k)) {
      const initiator = a.personality.outgoing > b.personality.outgoing ? a : b;
      this._crushes.add(k);
      bus.emit('drama:event', { type: 'crush', names: [initiator.name, (initiator === a ? b : a).name] });
    }

    // Milestone thresholds
    this._checkMilestone(a.name, b.name, score);

    // Reconciliation: enemies that haven't argued in >30s
    if (this._rivalries.has(k)) {
      const last = this._lastArgue.get(k) || 0;
      if (Date.now() - last > 30_000 && score > -10) {
        this._rivalries.delete(k);
        bus.emit('drama:event', { type: 'reconciliation', names: k.split(':') });
      }
    }

    // Jealousy: a (mean) is friends with b but b is also close to c
    if (a.personality.nice < -0.3 && score > 30) {
      const sims = this._game.sims;
      for (const c of sims) {
        if (c === a || c === b) continue;
        const bc = socialManager.score(b.id, c.id);
        const ac = socialManager.score(a.id, c.id);
        if (bc > 40 && ac < -10 && Math.random() < 0.25) {
          bus.emit('drama:event', { type: 'jealousy', names: [a.name, c.name] });
          // jealous Sim gossips about C to B
          this._gossip(a, b, c);
          break;
        }
      }
    }

    // Betrayal: mean Sim + high score with B → gossips about B to C
    if (a.personality.nice < -0.5 && score > 40 && Math.random() < 0.2) {
      const sims = this._game.sims;
      const c = sims.find(s => s !== a && s !== b);
      if (c) {
        bus.emit('drama:event', { type: 'betrayal', names: [a.name, b.name] });
        this._gossip(a, c, b);
        socialManager.interact(a.id, b.id, 'insult'); // relationship hit
      }
    }
  }

  _gossip(gossiper, listener, subject) {
    const type = gossiper.personality.nice < 0 ? 'negative' : 'positive';
    bus.emit('sim:gossip', {
      gossiper: gossiper.name,
      subject:  subject.name,
      listener: listener.name,
      type,
    });
    // Listener's opinion of subject shifts slightly
    const delta = type === 'negative' ? -8 : 5;
    socialManager.interact(listener.id, subject.id, delta > 0 ? 'compliment' : 'argue');

    // 30% chance the subject finds out and resents the gossiper
    if (type === 'negative' && Math.random() < 0.3) {
      const dyn = this._game?.socialDynamics;
      if (dyn) dyn.applyInteraction(subject.id, gossiper.id, 'insult', true);
      bus.emit('gossip:discovered', {
        subjectId: subject.id, subjectName: subject.name,
        gossiperName: gossiper.name,
      });
      bus.emit('story:entry', {
        text: `${subject.name} ha scoperto che ${gossiper.name} sparla di lui/lei.`,
        cat: 'drama',
      });
    }
  }

  _checkMilestone(nameA, nameB, score) {
    const k = [nameA, nameB].sort().join(':');
    const prev = this._milestones?.get(k) || 0;
    if (!this._milestones) this._milestones = new Map();
    let level = null;
    if      (score >= 80 && prev < 80) level = 'best_friend';
    else if (score >= 50 && prev < 50) level = 'good_friend';
    else if (score >= 25 && prev < 25) level = 'friend';
    else if (score <= -50 && prev > -50) level = 'enemy';
    if (level) {
      this._milestones.set(k, score);
      bus.emit('relationship:milestone', { nameA, nameB, level });
    } else {
      this._milestones.set(k, score);
    }
  }
}

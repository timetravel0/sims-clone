import { bus } from '../core/EventBus.js';
import {
  WalkToDoorAction,
  RingDoorbellAction,
  WaitForInviteAction,
  EnterHouseAction,
  VisitSocializeAction,
  LeaveHouseAction,
  ReturnHomeAction,
} from '../ai/VisitorActions.js';

const VISIT_REASONS = new Set([
  'spontaneous_neighbor',
  'invited_friend',
  'family_visit',
  'romantic_visit',
  'conflict_visit',
  'service_visit',
]);
const HARD_TIMEOUT_TICKS = 540;

let _visitId = 0;

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

export class VisitorSystem {
  constructor(game) {
    this._game = game;
    this._visits = new Map();
    this._history = [];
    this._lastDoorbell = null;
    this._scheduleTimer = 35;

    bus.on('offlot:visitIntent', payload => {
      this.scheduleVisit(payload.personId, payload.hostId, payload.reason ?? 'spontaneous_neighbor');
    });
  }

  activeVisits() {
    return [...this._visits.values()].filter(v => !['returned_home', 'visitEnded'].includes(v.state));
  }

  history() { return this._history.slice(); }
  lastDoorbell() { return this._lastDoorbell; }

  scheduleVisit(personId, hostId = null, reason = 'spontaneous_neighbor', opts = {}) {
    if (!personId || this._visits.has(personId)) return null;
    const person = this._game.population?.getPerson?.(personId);
    if (!person || this._game.population?.isHouseholdMember?.(personId)) return null;
    const host = hostId ? this._game.sims.find(s => s.id === hostId) : this._chooseHost(personId);
    if (!host) return null;
    const entry = this._entryPoint(opts.entryPointId);
    const visit = {
      id: opts.id ?? `visit_${++_visitId}`,
      personId,
      hostId: host.id,
      preferredHostId: host.id,
      respondingHostId: null,
      state: 'off_lot',
      reason: VISIT_REASONS.has(reason) ? reason : 'spontaneous_neighbor',
      arrivalTick: null,
      enteredTick: null,
      leaveByTick: null,
      actualLeftTick: null,
      entryPointId: entry.id,
      invited: false,
      outcome: null,
      socialSummary: { interactions: 0, positives: 0, negatives: 0 },
      _phaseStarted: this._game.tick,
      _decisionAt: null,
      _visitorSimId: null,
      _relationshipBefore: this._affinity(host.id, personId),
    };
    this._visits.set(personId, visit);
    this._emit('visitor:scheduled', visit);
    return visit;
  }

  update(dt) {
    this._scheduleTimer -= dt;
    if (this._scheduleTimer <= 0) {
      this._scheduleTimer = 75 + Math.random() * 75;
      this._maybeSpontaneousVisit();
    }

    for (const visit of [...this._visits.values()]) this._updateVisit(visit);
  }

  decideDoorResponse(host, visitor, context = {}) {
    const dyn = this._game.socialDynamics;
    const rel = dyn?.snapshot?.(host.id, visitor.id) ?? {};
    const hour = this._game.clock?.hour ?? 12;
    const p = host.personality ?? {};
    const energy = host.needs?.get?.('energy') ?? 50;
    let score = 0.45;
    score += (dyn?.affinity?.(host.id, visitor.id) ?? 0) / 180;
    score += (rel.trust ?? 0) * 0.004 + (rel.affection ?? 0) * 0.004;
    score -= (rel.resentment ?? 0) * 0.008 + (rel.fear ?? 0) * 0.006;
    score += (p.nice ?? 0) * 0.12 + (p.outgoing ?? 0) * 0.12 - Math.max(0, p.neurotic ?? 0) * 0.08;
    score += (energy - 35) / 220;
    if (hour < 7 || hour > 23) score -= 0.25;
    if (context.reason === 'invited_friend' || context.reason === 'family_visit') score += 0.22;
    if (context.reason === 'romantic_visit') score += ((rel.attraction ?? 0) / 180) + 0.08;
    if (context.reason === 'conflict_visit') score -= 0.18;
    const acceptChance = clamp01(score);
    const noAnswerChance = clamp01((energy < 18 ? 0.25 : 0.04) + ((hour < 6 || hour > 24) ? 0.18 : 0));
    if (Math.random() < noAnswerChance) return { accepted: false, noAnswer: true, score: acceptChance };
    return { accepted: Math.random() < acceptChance, noAnswer: false, score: acceptChance };
  }

  serialise() {
    return {
      visits: [...this._visits.values()].map(v => this._plain(v)),
      history: this._history.slice(-200).map(v => this._plain(v)),
      lastDoorbell: this._lastDoorbell,
    };
  }

  restore(data = {}) {
    this._visits.clear();
    this._history = Array.isArray(data.history) ? data.history.slice(-200) : [];
    this._lastDoorbell = data.lastDoorbell ?? null;
    for (const v of data.visits ?? []) {
      if (['arriving', 'ringing_doorbell', 'waiting_response', 'invited_in', 'visiting', 'leaving'].includes(v.state)) {
        v.state = 'returned_home';
        v.outcome = v.outcome ?? 'restored_off_lot';
        this._history.push(this._plain(v));
      }
    }
  }

  _updateVisit(visit) {
    const person = this._game.population?.getPerson?.(visit.personId);
    const host = this._visitHost(visit);
    if (!person || !host) { this._endVisit(visit, 'no_host'); return; }
    if (!['leaving', 'rejected', 'no_answer', 'returned_home'].includes(visit.state) &&
        visit.arrivalTick &&
        this._game.tick - visit.arrivalTick > HARD_TIMEOUT_TICKS) {
      this._forceReturn(visit, 'timeout');
      return;
    }

    if (visit.state === 'off_lot') {
      this._arrive(visit);
      return;
    }

    const visitor = this._visitorSim(visit);
    if (!visitor) { this._endVisit(visit, 'lost_visitor'); return; }

    if (visit.state === 'arriving' && this._idle(visitor)) {
      visit.state = 'ringing_doorbell';
      visit._phaseStarted = this._game.tick;
      this._lastDoorbell = this._plain(visit);
      visitor.brain?.override?.([
        new RingDoorbellAction(visitor, this._plain(visit)),
        new WaitForInviteAction(visitor, 2),
      ]);
      this._emit('visitor:doorbell', visit);
      return;
    }

    if (visit.state === 'ringing_doorbell' && this._idle(visitor)) {
      visit.state = 'waiting_response';
      visit._phaseStarted = this._game.tick;
      visit._decisionAt = this._game.tick + 2 + Math.floor(Math.random() * 5);
      this._emit('visitor:waiting', visit);
      return;
    }

    if (visit.state === 'waiting_response') {
      if (this._game.tick >= visit._decisionAt) this._doorDecision(visit, visitor);
      return;
    }

    if (visit.state === 'invited_in' && this._idle(visitor)) {
      visit.state = 'visiting';
      visit.enteredTick = this._game.tick;
      visit.leaveByTick = this._game.tick + 120 + Math.floor(Math.random() * 120);
      visitor._visitorMode = { hostId: host.id, reason: visit.reason };
      visitor.brain?.override?.([new VisitSocializeAction(visitor, host, this._game.world, this._socialTypeFor(visit))]);
      this._emit('visitor:entered', visit);
      return;
    }

    if (visit.state === 'visiting') {
      this._trackSocialSummary(visit);
      if (this._shouldLeave(visit, visitor, host)) this._startLeaving(visit, visitor);
      else if (this._idle(visitor) && Math.random() < 0.02) {
        visitor.brain?.override?.([new VisitSocializeAction(visitor, host, this._game.world, this._socialTypeFor(visit))]);
      }
      return;
    }

    if ((visit.state === 'rejected' || visit.state === 'no_answer' || visit.state === 'leaving') && this._idle(visitor)) {
      this._returnHome(visit, visitor);
    }
  }

  _arrive(visit) {
    const entry = this._entryPoint(visit.entryPointId);
    const sim = this._game.population.activatePerson(visit.personId, entry);
    if (!sim) { this._endVisit(visit, 'activation_failed'); return; }
    visit.state = 'arriving';
    visit.arrivalTick = this._game.tick;
    visit._phaseStarted = this._game.tick;
    visit._visitorSimId = sim.id;
    sim._isVisitor = true;
    sim._visitorMode = { hostId: visit.hostId, reason: visit.reason };
    sim.brain?.override?.([new WalkToDoorAction(sim, this._game.world, entry)]);
    this._emit('visitor:arriving', visit);
  }

  _doorDecision(visit, visitor, host) {
    host = this._chooseDoorResponder(visit, visitor) ?? host ?? this._visitHost(visit);
    if (!host) { this._endVisit(visit, 'no_host'); return; }
    visit.respondingHostId = host.id;
    visit.hostId = host.id;
    const before = this._affinity(host.id, visitor.id);
    const decision = this.decideDoorResponse(host, visitor, { reason: visit.reason, visit });
    visit._relationshipBefore = before;
    if (decision.noAnswer) {
      visit.state = 'no_answer';
      visit.outcome = 'no_answer';
      this._applyDoorEffect(host.id, visitor.id, 'no_answer', visit.reason);
      this._emit('visitor:noAnswer', visit);
      this._startExitMotion(visitor, visit);
      return;
    }
    if (!decision.accepted) {
      visit.state = 'rejected';
      visit.invited = false;
      visit.outcome = 'rejected';
      this._applyDoorEffect(host.id, visitor.id, 'rejected', visit.reason);
      this._emit('visitor:rejected', visit);
      visitor.showBubble('Maybe later', 2);
      this._startExitMotion(visitor, visit);
      return;
    }
    visit.state = 'invited_in';
    visit.invited = true;
    visit.outcome = 'accepted';
    this._applyDoorEffect(host.id, visitor.id, 'invited', visit.reason);
    this._emit('visitor:invited', visit);
    visitor.brain?.override?.([new EnterHouseAction(visitor, this._game.world, this._entryPoint(visit.entryPointId))]);
  }

  _startLeaving(visit, visitor) {
    visit.state = 'leaving';
    visit.outcome = visit.outcome ?? 'completed';
    this._emit('visitor:leaving', visit);
    this._startExitMotion(visitor, visit);
  }

  _startExitMotion(visitor, visit) {
    const entry = this._entryPoint(visit.entryPointId);
    visitor.brain?.override?.([
      new LeaveHouseAction(visitor, this._game.world, entry),
      new ReturnHomeAction(visitor, this._game.world, entry),
    ]);
  }

  _returnHome(visit, visitor) {
    visit.actualLeftTick = this._game.tick;
    visit.state = 'returned_home';
    visitor._visitorMode = null;
    this._emit('visitor:left', visit);
    this._emit('visitor:visitEnded', visit);
    this._game.population.deactivatePerson(visit.personId);
    this._history.push(this._plain(visit));
    if (this._history.length > 200) this._history.shift();
    this._visits.delete(visit.personId);
  }

  _endVisit(visit, outcome) {
    const visitor = this._visitorSim(visit);
    if (visitor) visitor._visitorMode = null;
    visit.outcome = outcome;
    visit.actualLeftTick = this._game.tick;
    visit.state = 'returned_home';
    this._emit('visitor:visitEnded', visit);
    this._game.population?.deactivatePerson?.(visit.personId);
    this._history.push(this._plain(visit));
    this._visits.delete(visit.personId);
  }

  _forceReturn(visit, outcome) {
    const visitor = this._visitorSim(visit);
    if (visitor && this._idle(visitor)) {
      this._startLeaving(visit, visitor);
      visit.outcome = outcome;
      return;
    }
    this._endVisit(visit, outcome);
  }

  _shouldLeave(visit, visitor, host) {
    if (this._game.tick >= visit.leaveByTick) return true;
    const aff = this._game.socialDynamics?.affinity?.(visitor.id, host.id) ?? 0;
    if (aff < -35) return true;
    if ((visitor.needs?.get?.('energy') ?? 100) < 12) return true;
    if ((visitor.needs?.get?.('hunger') ?? 100) < 16) return true;
    if ((visitor.needs?.get?.('bladder') ?? 100) < 16) return true;
    return false;
  }

  _socialTypeFor(visit) {
    if (visit.reason === 'conflict_visit') return 'confront';
    if (visit.reason === 'romantic_visit') return 'flirt';
    if (visit.reason === 'family_visit') return 'hug';
    return 'chat';
  }

  _applyDoorEffect(hostId, visitorId, outcome, reason) {
    const dyn = this._game.socialDynamics;
    if (!dyn) return;
    const apply = (from, to, deltas) => dyn._apply?.(from, to, deltas);
    if (outcome === 'invited') {
      apply(hostId, visitorId, { trust: 2, affection: 2, familiarity: 3 });
      apply(visitorId, hostId, { trust: 3, affection: reason === 'romantic_visit' ? 4 : 2, attraction: reason === 'romantic_visit' ? 3 : 0, familiarity: 3 });
    } else if (outcome === 'rejected') {
      apply(visitorId, hostId, { resentment: reason === 'conflict_visit' ? 4 : 7, affection: -4, trust: -3 });
      apply(hostId, visitorId, { resentment: reason === 'conflict_visit' ? 3 : 1 });
    } else if (outcome === 'no_answer') {
      apply(visitorId, hostId, { resentment: 3, trust: -2, affection: -2 });
    }
  }

  _trackSocialSummary(visit) {
    const rows = this._game.experimentLogger?._socialRows?.() ?? [];
    const count = rows.filter(r =>
      (r.actorId === visit.personId && r.targetId === visit.hostId) ||
      (r.actorId === visit.hostId && r.targetId === visit.personId)
    ).length;
    visit.socialSummary.interactions = count;
  }

  _maybeSpontaneousVisit() {
    if (this.activeVisits().length > 0) return;
    const pool = this._game.population?.offLotPeople?.().filter(p => p.offLotState !== 'unavailable') ?? [];
    if (pool.length === 0 || Math.random() > 0.35) return;
    const person = pool[Math.floor(Math.random() * pool.length)];
    this.scheduleVisit(person.id, null, person.role === 'relative' ? 'family_visit' : 'spontaneous_neighbor');
  }

  _chooseHost(personId) {
    const sims = this._game.sims.filter(s => !s._isVisitor && !s._atWork);
    if (sims.length === 0) return null;
    const dyn = this._game.socialDynamics;
    return sims.slice().sort((a, b) => (dyn?.affinity?.(b.id, personId) ?? 0) - (dyn?.affinity?.(a.id, personId) ?? 0))[0];
  }

  _visitHost(visit) {
    return this._game.sims.find(s => s.id === (visit.respondingHostId ?? visit.hostId))
      ?? this._game.sims.find(s => s.id === visit.preferredHostId)
      ?? this._chooseHost(visit.personId);
  }

  _chooseDoorResponder(visit, visitor) {
    const sims = this._game.sims.filter(s => !s._isVisitor && !s._atWork);
    if (sims.length === 0) return null;
    const dyn = this._game.socialDynamics;
    const entry = this._entryPoint(visit.entryPointId);
    return sims.slice().sort((a, b) =>
      this._responderScore(b, visitor, dyn, entry, visit) - this._responderScore(a, visitor, dyn, entry, visit)
    )[0];
  }

  _responderScore(host, visitor, dyn, entry, visit) {
    const rel = dyn?.snapshot?.(host.id, visitor.id) ?? {};
    const distance = Math.abs((host.gx ?? host.worldX) - (entry.insideGx ?? entry.gx))
      + Math.abs((host.gz ?? host.worldZ) - (entry.insideGz ?? entry.gz));
    const preferred = host.id === visit.preferredHostId ? 8 : 0;
    return preferred
      + (dyn?.affinity?.(host.id, visitor.id) ?? 0) * 0.22
      + (rel.trust ?? 0) * 0.15
      + (rel.affection ?? 0) * 0.12
      - (rel.resentment ?? 0) * 0.16
      + ((host.needs?.get?.('energy') ?? 50) - 35) * 0.25
      + ((host.personality?.nice ?? 0) + (host.personality?.outgoing ?? 0)) * 10
      - distance * 1.5;
  }

  _visitorSim(visit) {
    return this._game.sims.find(s => s.id === visit._visitorSimId || s.id === visit.personId) ?? null;
  }

  _entryPoint(id = null) {
    return this._game.world?.getEntryPoint?.(id) ??
      this._game.world?.getEntryPointByType?.('front_door') ??
      { id: 'fallback_edge', gx: 5, gz: 0, doorGx: 5, doorGz: 0, insideGx: 5, insideGz: 1 };
  }

  _idle(sim) { return !sim.isMoving && !sim.brain?.busy; }
  _affinity(a, b) { return Math.round(this._game.socialDynamics?.affinity?.(a, b) ?? 0); }

  _emit(type, visit) {
    const visitor = this._game.population?.getPerson?.(visit.personId);
    const host = this._game.sims.find(s => s.id === visit.hostId);
    bus.emit(type, {
      ...this._plain(visit),
      visitorId: visit.personId,
      visitorName: visitor?.name ?? visit.personId,
      hostId: visit.hostId,
      hostName: host?.name ?? visit.hostId,
      duration: visit.enteredTick && visit.actualLeftTick ? visit.actualLeftTick - visit.enteredTick : 0,
      relationshipBefore: visit._relationshipBefore ?? '',
      relationshipAfter: host ? this._affinity(host.id, visit.personId) : '',
    });
  }

  _plain(visit) {
    const { _phaseStarted, _decisionAt, _visitorSimId, _relationshipBefore, ...plain } = visit;
    return { ...plain, socialSummary: { ...(plain.socialSummary ?? {}) } };
  }
}

import { bus } from '../core/EventBus.js';

const NEGATIVE_TYPES = new Set(['argue', 'insult', 'confront', 'avoid', 'reject_flirt']);

const EVENTS = [
  'social:interaction',
  'social:update',
  'visitor:scheduled',
  'visitor:arriving',
  'visitor:doorbell',
  'visitor:invited',
  'visitor:rejected',
  'visitor:noAnswer',
  'visitor:entered',
  'visitor:leaving',
  'visitor:left',
  'visitor:visitEnded',
  'offlot:stateChanged',
  'offlot:visitIntent',
  'offlot:relationshipDrift',
  'mood:change',
  'emotion:triggered',
  'life:event',
  'god:action',
  'relationship:graphChanged',
  'need:crisis',
  'sim:action',
];

export class ExperimentLogger {
  constructor(game = null) {
    this._game = game;
    this._tick = 0;
    this._events = [];
    this._unsubscribers = EVENTS.map(type =>
      bus.on(type, payload => this.record(type, payload))
    );
  }

  update(dt) {
    this._tick += 1;
    this._lastDt = dt;
  }

  record(type, payload = {}) {
    const clock = this._game?.clock ?? {};
    const base = {
      tick:    this._tick,
      simHour: Number(clock.hour ?? 0).toFixed(2),
      simDay:  clock.day ?? 0,
      weekday: clock.weekday ?? 0,
      type,
    };
    let row;
    if (type === 'social:interaction') {
      // Standardised social-event schema (Social Core 2.0)
      row = {
        ...base,
        eventId:            payload.eventId ?? `e_${this._tick}`,
        actorId:            payload.idA ?? '',
        targetId:           payload.idB ?? '',
        actorName:          payload.nameA ?? '',
        targetName:         payload.nameB ?? '',
        interactionType:    payload.type ?? '',
        accepted:           payload.accepted === true,
        location:           payload.location ?? '',
        isPublic:           payload.isPublic === true,
        witnesses:          Array.isArray(payload.witnesses) ? payload.witnesses.length : 0,
        relationshipBefore: payload.relationshipBefore ?? '',
        relationshipAfter:  payload.relationshipAfter ?? '',
        dominantMotive:     payload.dominantMotive ?? '',
        activeGoal:         payload.activeGoal ?? '',
        delta:              payload.delta ?? 0,
      };
    } else if (type.startsWith('visitor:')) {
      row = {
        ...base,
        eventId: payload.eventId ?? `v_${this._tick}_${this._events.length}`,
        visitorId: payload.visitorId ?? payload.personId ?? '',
        visitorName: payload.visitorName ?? '',
        hostId: payload.hostId ?? '',
        hostName: payload.hostName ?? '',
        reason: payload.reason ?? '',
        state: payload.state ?? '',
        outcome: payload.outcome ?? '',
        accepted: payload.invited === true || payload.accepted === true,
        entryPointId: payload.entryPointId ?? '',
        duration: payload.duration ?? 0,
        relationshipBefore: payload.relationshipBefore ?? '',
        relationshipAfter: payload.relationshipAfter ?? '',
        payload: this._simple(payload.socialSummary ?? payload.payload ?? ''),
      };
    } else if (type.startsWith('offlot:')) {
      row = {
        ...base,
        eventId: payload.eventId ?? `o_${this._tick}_${this._events.length}`,
        personId: payload.personId ?? '',
        personName: payload.personName ?? '',
        hostId: payload.hostId ?? '',
        hostName: payload.hostName ?? '',
        state: payload.state ?? '',
        previous: payload.previous ?? '',
        reason: payload.reason ?? '',
        delta: payload.delta ?? '',
      };
    } else {
      row = { ...base, ...this._sanitize(payload) };
    }
    this._events.push(row);
    if (this._events.length > 20000) this._events.shift();
  }

  // ── Analysis helpers (Social Core 2.0) ──────────────────────────────────────

  _socialRows() { return this._events.filter(e => e.type === 'social:interaction'); }
  _visitorRows() { return this._events.filter(e => e.type?.startsWith?.('visitor:')); }
  _offLotRows() { return this._events.filter(e => e.type?.startsWith?.('offlot:')); }

  /** Per-Sim aggregate: interactions initiated, acceptance rate, motive mix. */
  summaryBySim() {
    const out = {};
    for (const e of this._socialRows()) {
      const s = out[e.actorId] ??= { simId: e.actorId, name: e.actorName, total: 0, accepted: 0, positive: 0, negative: 0, motives: {} };
      s.total++;
      if (e.accepted) s.accepted++;
      if (NEGATIVE_TYPES.has(e.interactionType)) s.negative++; else s.positive++;
      if (e.dominantMotive) s.motives[e.dominantMotive] = (s.motives[e.dominantMotive] ?? 0) + 1;
    }
    for (const s of Object.values(out)) s.acceptanceRate = s.total ? +(s.accepted / s.total).toFixed(2) : 0;
    return out;
  }

  /** Per-unordered-pair aggregate. */
  summaryByPair() {
    const out = {};
    for (const e of this._socialRows()) {
      const key = [e.actorId, e.targetId].sort().join('|');
      const p = out[key] ??= { pair: key, names: `${e.actorName}/${e.targetName}`, total: 0, accepted: 0, negative: 0, lastRelationship: '' };
      p.total++;
      if (e.accepted) p.accepted++;
      if (NEGATIVE_TYPES.has(e.interactionType)) p.negative++;
      if (e.relationshipAfter !== '') p.lastRelationship = e.relationshipAfter;
    }
    return out;
  }

  /** Ordered timeline of interactions between two Sims (either direction). */
  relationshipTimeline(pair = []) {
    const [a, b] = pair;
    return this._socialRows()
      .filter(e => (e.actorId === a && e.targetId === b) || (e.actorId === b && e.targetId === a))
      .map(e => ({
        tick: e.tick, simDay: e.simDay, actorId: e.actorId, targetId: e.targetId,
        interactionType: e.interactionType, accepted: e.accepted,
        relationshipAfter: e.relationshipAfter, dominantMotive: e.dominantMotive,
      }));
  }

  summaryByVisitor() {
    const out = {};
    for (const e of this._visitorRows()) {
      const id = e.visitorId || 'unknown';
      const s = out[id] ??= { visitorId: id, name: e.visitorName || id, total: 0, accepted: 0, rejected: 0, noAnswer: 0, duration: 0 };
      if (e.type === 'visitor:visitEnded') {
        s.total++;
        if (e.outcome === 'accepted' || e.accepted) s.accepted++;
        if (e.outcome === 'rejected') s.rejected++;
        if (e.outcome === 'no_answer') s.noAnswer++;
        s.duration += Number(e.duration || 0);
      }
    }
    for (const s of Object.values(out)) {
      s.acceptanceRate = s.total ? +(s.accepted / s.total).toFixed(2) : 0;
      s.averageDuration = s.total ? +(s.duration / s.total).toFixed(1) : 0;
    }
    return out;
  }

  summaryByVisitReason() {
    const out = {};
    for (const e of this._visitorRows().filter(r => r.type === 'visitor:visitEnded')) {
      const key = e.reason || 'unknown';
      const s = out[key] ??= { reason: key, total: 0, accepted: 0, rejected: 0, noAnswer: 0, duration: 0 };
      s.total++;
      if (e.outcome === 'accepted' || e.accepted) s.accepted++;
      if (e.outcome === 'rejected') s.rejected++;
      if (e.outcome === 'no_answer') s.noAnswer++;
      s.duration += Number(e.duration || 0);
    }
    return out;
  }

  visitTimeline(visitorId) {
    return this._visitorRows().filter(e => !visitorId || e.visitorId === visitorId);
  }

  externalSocialityMetrics() {
    const visits = this._visitorRows().filter(e => e.type === 'visitor:visitEnded');
    const accepted = visits.filter(e => e.outcome === 'accepted' || e.accepted).length;
    const rejected = visits.filter(e => e.outcome === 'rejected').length;
    const noAnswer = visits.filter(e => e.outcome === 'no_answer').length;
    const durations = visits.map(e => Number(e.duration || 0)).filter(n => n > 0);
    const socialRows = this._socialRows();
    const population = this._game?.population;
    const externalIds = new Set(population?.allPeople?.().filter(p => p.role !== 'household').map(p => p.id) ?? []);
    const externalInteractions = socialRows.filter(e => externalIds.has(e.actorId) || externalIds.has(e.targetId)).length;
    const byVisitor = this.summaryByVisitor();
    const byHost = {};
    for (const e of visits) if (e.hostId) byHost[e.hostId] = (byHost[e.hostId] ?? 0) + 1;
    const maxKey = obj => Object.entries(obj).sort((a, b) => (b[1].total ?? b[1]) - (a[1].total ?? a[1]))[0]?.[0] ?? '';
    return {
      totalVisits: visits.length,
      visitAcceptanceRate: visits.length ? +(accepted / visits.length).toFixed(2) : 0,
      rejectedVisits: rejected,
      noAnswerVisits: noAnswer,
      averageVisitDuration: durations.length ? +(durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1) : 0,
      externalInteractionRate: socialRows.length ? +(externalInteractions / socialRows.length).toFixed(2) : 0,
      outsideNetworkSize: externalIds.size,
      mostFrequentVisitor: byVisitor[maxKey(byVisitor)]?.name ?? '',
      mostRejectedVisitor: Object.values(byVisitor).sort((a, b) => b.rejected - a.rejected)[0]?.name ?? '',
      mostVisitedHost: byHost[maxKey(byHost)] ? (this._game?.sims?.find(s => s.id === maxKey(byHost))?.name ?? maxKey(byHost)) : '',
    };
  }

  clear() {
    this._events = [];
  }

  dispose() {
    for (const off of this._unsubscribers) off();
    this._unsubscribers = [];
  }

  serialise() {
    return {
      tick: this._tick,
      events: this._events,
    };
  }

  restore(data = {}) {
    this._tick = data.tick ?? 0;
    this._events = Array.isArray(data.events) ? data.events.slice(-20000) : [];
  }

  toJSON() {
    return JSON.stringify(this._events, null, 2);
  }

  toCSV() {
    if (this._events.length === 0) return 'tick,simHour,type\n';
    const keys = Array.from(this._events.reduce((set, row) => {
      Object.keys(row).forEach(key => set.add(key));
      return set;
    }, new Set(['tick', 'simHour', 'type'])));
    return [
      keys.join(','),
      ...this._events.map(row => keys.map(key => this._csv(row[key])).join(',')),
    ].join('\n');
  }

  downloadJSON(filename = 'experiment-log.json') {
    this._download(filename, this.toJSON(), 'application/json');
  }

  downloadCSV(filename = 'experiment-log.csv') {
    this._download(filename, this.toCSV(), 'text/csv');
  }

  get events() {
    return this._events;
  }

  _sanitize(payload) {
    const out = {};
    for (const [key, value] of Object.entries(payload || {})) {
      if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) {
        out[key] = value;
      } else if (Array.isArray(value)) {
        out[key] = value.map(v => this._simple(v)).join('|');
      } else {
        out[key] = this._simple(value);
      }
    }
    return out;
  }

  _simple(value) {
    if (value == null) return '';
    if (['string', 'number', 'boolean'].includes(typeof value)) return value;
    return value.id || value.name || JSON.stringify(value);
  }

  _csv(value) {
    const text = value == null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  _download(filename, content, mime) {
    if (typeof document === 'undefined') return;
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

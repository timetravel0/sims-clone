import { bus } from '../core/EventBus.js';

/**
 * ExperimentDashboard — observation panel for Social Simulation Core 2.0.
 *
 * Shows, for the current household:
 *   - a timeline of recent social events,
 *   - a directional relationship matrix (affinity heat-map),
 *   - a human-readable explanation for a selected (from → to) pair,
 *   - aggregate metrics: conflictRate, positiveInteractionRate,
 *     isolationIndex, strongestBond, highestResentment.
 *
 * Reads game.experimentLogger and game.socialDynamics. Toolbar button #btn-lab.
 * DOM anchor: <div id="experiment-panel">.
 */

const NEG = new Set(['argue', 'insult', 'confront', 'avoid', 'reject_flirt']);

function affColor(v) {
  // v in [-100,100] → red↔grey↔green
  if (v >= 0) { const t = Math.min(1, v / 80); return `rgba(${Math.round(120 - 90 * t)},${Math.round(120 + 80 * t)},110,0.85)`; }
  const t = Math.min(1, -v / 80); return `rgba(${Math.round(150 + 80 * t)},${Math.round(90 - 50 * t)},90,0.85)`;
}

export class ExperimentDashboard {
  constructor(game) {
    this._game = game;
    this._el = document.getElementById('experiment-panel');
    this._pair = null;   // [fromId, toId]
    this._open = false;
    bus.on('social:interaction', () => { if (this._open) this._render(); });
    bus.on('visitor:visitEnded', () => { if (this._open) this._render(); });
    bus.on('visitor:doorbell', () => { if (this._open) this._render(); });
  }

  toggle() { this._open ? this.close() : this.open(); }
  open()  { this._open = true;  if (this._el) this._el.style.display = 'block'; this._render(); }
  close() { this._open = false; if (this._el) this._el.style.display = 'none'; }
  isOpen() { return this._open; }

  _sims() { return this._game.sims ?? []; }

  _render() {
    if (!this._el) return;
    const sims = this._sims();
    if (!this._pair && sims.length >= 2) this._pair = [sims[0].id, sims[1].id];

    this._el.innerHTML = `
      <div class="exp-head">
        <span>🧪 Experiment Dashboard</span>
        <div>
          <button id="exp-csv" title="Download CSV">⬇ CSV</button>
          <button id="exp-close" title="Close">✕</button>
        </div>
      </div>
      <div class="exp-metrics">${this._metricsHTML()}</div>
      <div class="exp-section-title">Simulation health</div>
      <div class="exp-population">${this._healthHTML()}</div>
      <div class="exp-section-title">Population & visitors</div>
      <div class="exp-population">${this._populationHTML()}</div>
      <div class="exp-section-title">Relationship matrix (row → col affinity)</div>
      <div class="exp-matrix">${this._matrixHTML()}</div>
      <div class="exp-section-title">Explain relation</div>
      <div class="exp-explain">${this._explainHTML()}</div>
      <div class="exp-section-title">Recent events</div>
      <div class="exp-timeline">${this._timelineHTML()}</div>`;

    this._el.querySelector('#exp-close')?.addEventListener('click', () => {
      this.close();
      document.getElementById('btn-lab')?.classList.remove('active');
    });
    this._el.querySelector('#exp-csv')?.addEventListener('click', () => this._game.experimentLogger?.downloadCSV());
    this._el.querySelectorAll('.exp-cell[data-from]').forEach(c => c.addEventListener('click', () => {
      this._pair = [c.dataset.from, c.dataset.to];
      this._render();
    }));
  }

  // ── Metrics ─────────────────────────────────────────────────────────────────

  _metrics() {
    const logger = this._game.experimentLogger;
    const dyn = this._game.socialDynamics;
    const sims = this._sims();
    const rows = logger?._socialRows?.() ?? [];
    const total = rows.length;
    const negative = rows.filter(r => NEG.has(r.interactionType)).length;
    const acceptedPos = rows.filter(r => r.accepted && !NEG.has(r.interactionType)).length;

    let strongest = { names: '—', val: -Infinity };
    let resent    = { names: '—', val: -Infinity };
    let isolated  = 0;
    for (const a of sims) {
      let maxAff = -Infinity;
      for (const b of sims) {
        if (a.id === b.id) continue;
        const aff = dyn?.affinity(a.id, b.id) ?? 0;
        maxAff = Math.max(maxAff, aff);
        if (aff > strongest.val) strongest = { names: `${a.name}→${b.name}`, val: Math.round(aff) };
        const res = dyn?.get(a.id, b.id)?.resentment ?? 0;
        if (res > resent.val) resent = { names: `${a.name}→${b.name}`, val: Math.round(res) };
      }
      if (maxAff < 15) isolated++;
    }
    return {
      conflictRate: total ? (negative / total) : 0,
      positiveInteractionRate: total ? (acceptedPos / total) : 0,
      isolationIndex: sims.length ? (isolated / sims.length) : 0,
      strongestBond: strongest.val > -Infinity ? `${strongest.names} (${strongest.val})` : '—',
      highestResentment: resent.val > 0 ? `${resent.names} (${resent.val})` : '—',
      total,
      external: logger?.externalSocialityMetrics?.() ?? {},
    };
  }

  _metricsHTML() {
    const m = this._metrics();
    const pct = v => `${Math.round(v * 100)}%`;
    return `
      <div class="exp-metric"><b>${pct(m.conflictRate)}</b><span>conflict rate</span></div>
      <div class="exp-metric"><b>${pct(m.positiveInteractionRate)}</b><span>positive rate</span></div>
      <div class="exp-metric"><b>${pct(m.isolationIndex)}</b><span>isolation</span></div>
      <div class="exp-metric"><b>${m.strongestBond}</b><span>strongest bond</span></div>
      <div class="exp-metric"><b>${m.highestResentment}</b><span>highest resentment</span></div>
      <div class="exp-metric"><b>${m.total}</b><span>events logged</span></div>
      <div class="exp-metric"><b>${pct(m.external.visitAcceptanceRate ?? 0)}</b><span>visit accepted</span></div>
      <div class="exp-metric"><b>${m.external.averageVisitDuration ?? 0}</b><span>avg visit ticks</span></div>`;
  }

  _populationHTML() {
    const pop = this._game.population;
    const visitors = this._game.visitorSystem;
    if (!pop) return '<div class="exp-empty">No population system.</div>';
    const active = visitors?.activeVisits?.() ?? [];
    const history = visitors?.history?.().slice(-5).reverse() ?? [];
    const last = visitors?.lastDoorbell?.();
    const person = id => pop.getPerson?.(id)?.name ?? id;
    const familyBits = p => {
      const partner = pop.getPerson?.(p.partnerId)?.name ?? '—';
      return `${p.health?.state ?? 'healthy'} · partner ${partner} · kids ${(p.childIds ?? []).length}`;
    };
    return `
      <div class="exp-metrics">
        <div class="exp-metric"><b>${pop.householdMembers().length}</b><span>household</span></div>
        <div class="exp-metric"><b>${pop.activeVisitors().length}</b><span>active visitors</span></div>
        <div class="exp-metric"><b>${pop.offLotPeople().length}</b><span>off-lot</span></div>
        <div class="exp-metric"><b>${pop.allPeople().length}</b><span>total population</span></div>
      </div>
      <div class="exp-summary">Last doorbell: ${last ? `${person(last.personId)} for ${person(last.hostId)} · ${last.reason}` : '—'}</div>
      <div class="exp-summary">Active: ${active.length ? active.map(v => `${person(v.personId)} (${v.state})`).join(', ') : '—'}</div>
      <div class="exp-summary">Recent visits: ${history.length ? history.map(v => `${person(v.personId)} → ${v.outcome}`).join(', ') : '—'}</div>
      <div class="exp-summary">Household: ${pop.householdMembers().map(p => `${p.name} [${familyBits(p)}]`).join(' · ') || '—'}</div>`;
  }

  _healthHTML() {
    const h = this._game.experimentLogger?.simulationHealthMetrics?.() ?? {};
    const pct = v => `${Math.round((v ?? 0) * 100)}%`;
    const needs = Object.entries(h.needCrisesByNeed ?? {})
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}: ${v}`).join(', ') || '—';
    return `
      <div class="exp-metrics">
        <div class="exp-metric"><b>${h.needCrises ?? 0}</b><span>need crises</span></div>
        <div class="exp-metric"><b>${h.stuckVisitors ?? 0}</b><span>stuck visitors</span></div>
        <div class="exp-metric"><b>${h.offLotTransitionsPerPerson ?? 0}</b><span>off-lot churn / person</span></div>
        <div class="exp-metric"><b>${pct(h.socialAcceptanceRate)}</b><span>social acceptance</span></div>
        <div class="exp-metric"><b>${pct(h.negativeSocialRate)}</b><span>negative social</span></div>
        <div class="exp-metric"><b>${h.legacySocialEvents ?? 0}</b><span>legacy social rows</span></div>
      </div>
      <div class="exp-summary">Need mix: ${needs}</div>
      <div class="exp-summary">Top crisis Sim: ${h.topNeedCrisisSim || '—'}</div>`;
  }

  // ── Matrix ──────────────────────────────────────────────────────────────────

  _matrixHTML() {
    const dyn = this._game.socialDynamics;
    const sims = this._peopleForMatrix();
    if (sims.length === 0 || !dyn) return '<div class="exp-empty">No Sims.</div>';
    let html = '<table class="exp-mtx"><tr><th></th>';
    for (const c of sims) html += `<th>${c.name[0]}</th>`;
    html += '</tr>';
    for (const r of sims) {
      html += `<tr><th>${r.name}</th>`;
      for (const c of sims) {
        if (r.id === c.id) { html += '<td class="exp-cell exp-diag">·</td>'; continue; }
        const v = Math.round(dyn.affinity(r.id, c.id));
        const sel = this._pair && this._pair[0] === r.id && this._pair[1] === c.id ? ' exp-sel' : '';
        html += `<td class="exp-cell${sel}" data-from="${r.id}" data-to="${c.id}" style="background:${affColor(v)}">${v}</td>`;
      }
      html += '</tr>';
    }
    return html + '</table>';
  }

  // ── Explanation ───────────────────────────────────────────────────────────────

  _explainHTML() {
    const dyn = this._game.socialDynamics;
    if (!this._pair || !dyn) return '<div class="exp-empty">Click a matrix cell.</div>';
    const [from, to] = this._pair;
    const ex = dyn.explainRelation(from, to);
    const dims = Object.entries(ex.dims)
      .map(([k, v]) => `<span class="exp-dim"><i>${k}</i>${Math.round(v)}</span>`).join('');
    return `
      <div class="exp-explain-head"><b>${ex.fromName} → ${ex.toName}</b>
        <span class="exp-label">${ex.label} · affinity ${ex.affinity}</span></div>
      <div class="exp-summary">${ex.summary}</div>
      <div class="exp-dims">${dims}</div>`;
  }

  // ── Timeline ──────────────────────────────────────────────────────────────────

  _timelineHTML() {
    const rows = (this._game.experimentLogger?.events ?? [])
      .filter(e => e.type === 'social:interaction' || e.type?.startsWith?.('visitor:') || e.type?.startsWith?.('offlot:') || e.type?.startsWith?.('health:') || e.type?.startsWith?.('family:') || e.type?.startsWith?.('career:'))
      .slice(-18).reverse();
    if (rows.length === 0) return '<div class="exp-empty">No events yet.</div>';
    return rows.map(e => {
      if (e.type?.startsWith?.('visitor:')) {
        return `<div class="exp-evt exp-neu">
          <span class="exp-day">D${e.simDay}</span>
          <span><b>${e.type}</b> ${e.visitorName || e.visitorId} → ${e.hostName || e.hostId}</span>
          <span class="exp-motive">${e.outcome || e.state || e.reason || ''}</span></div>`;
      }
      if (e.type?.startsWith?.('offlot:')) {
        return `<div class="exp-evt exp-neu">
          <span class="exp-day">D${e.simDay}</span>
          <span><b>${e.type}</b> ${e.personName || e.personId}</span>
          <span class="exp-motive">${e.state || e.reason || e.cause || ''}</span></div>`;
      }
      if (e.type?.startsWith?.('health:')) {
        return `<div class="exp-evt exp-neu">
          <span class="exp-day">D${e.simDay}</span>
          <span><b>${e.type}</b> ${e.personName || e.personId}</span>
          <span class="exp-motive">${e.state || e.illness || ''}</span></div>`;
      }
      if (e.type?.startsWith?.('family:')) {
        return `<div class="exp-evt exp-neu">
          <span class="exp-day">D${e.simDay}</span>
          <span><b>${e.type}</b> ${e.personName || e.childName || e.personId}</span>
          <span class="exp-motive">${e.partnerId || e.childId || e.householdId || ''}</span></div>`;
      }
      if (e.type?.startsWith?.('career:')) {
        return `<div class="exp-evt exp-neu">
          <span class="exp-day">D${e.simDay}</span>
          <span><b>${e.type}</b> ${e.simName || e.simId}</span>
          <span class="exp-motive">${e.career || e.mode || e.illness || ''}</span></div>`;
      }
      const cls = NEG.has(e.interactionType) ? 'neg' : (e.accepted ? 'pos' : 'rej');
      const ok = e.accepted ? '✓' : '✗';
      return `<div class="exp-evt exp-${cls}">
        <span class="exp-day">D${e.simDay}</span>
        <span>${e.actorName} <b>${e.interactionType}</b> ${e.targetName} ${ok}</span>
        <span class="exp-motive">${e.dominantMotive || ''}</span></div>`;
    }).join('');
  }

  _peopleForMatrix() {
    const pop = this._game.population;
    if (!pop) return this._sims();
    const people = pop.allPeople();
    return people.map(p => this._game.sims.find(s => s.id === p.id) ?? p);
  }
}

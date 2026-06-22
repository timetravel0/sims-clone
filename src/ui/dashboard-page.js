/**
 * dashboard-page.js — standalone Experiment Dashboard (opened in its own window
 * by the 🧪 Lab button). Reads the live game from window.opener._game (same
 * origin) and renders detailed, auto-refreshing social-experiment views.
 *
 * No build step / no imports: pure DOM + cross-window read of the running game.
 */
import { DIMENSIONS } from '../config/interactions.js';

const COLD = new Set(['resentment', 'fear']);
const NEG  = new Set(['argue', 'insult', 'confront', 'avoid', 'reject_flirt']);
const POLL_MS = 900;

let activeTab = 'overview';
let selPair = null;     // [fromId, toId]
let relDim = 'affinity';

const $ = id => document.getElementById(id);
const game = () => window.opener?._game ?? null;
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// ── colour helpers ──────────────────────────────────────────────────────────
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
function greenScale(v) { const t = Math.min(1, v / 100); return `rgba(${lerp(70, 90, t)},${lerp(82, 200, t)},${lerp(80, 120, t)},0.88)`; }
function redScale(v)   { const t = Math.min(1, v / 100); return `rgba(${lerp(70, 212, t)},${lerp(72, 84, t)},${lerp(72, 84, t)},0.88)`; }
function divergeAff(v) {
  if (v >= 0) { const t = Math.min(1, v / 80); return `rgba(${lerp(110, 90, t)},${lerp(110, 200, t)},100,0.88)`; }
  const t = Math.min(1, -v / 80); return `rgba(${lerp(110, 212, t)},${lerp(110, 82, t)},90,0.88)`;
}
const dimColor = (dim, v) => (COLD.has(dim) ? redScale(v) : greenScale(v));

// ── safe accessors ────────────────────────────────────────────────────────────
function info(g, sim) {
  const out = { age: null, career: null };
  try { out.age = g.ageSystem?.getInfo(sim.id); } catch {}
  try { out.career = g.careerSystem?.getInfo(sim.id); } catch {}
  return out;
}
function lowestNeeds(sim, n = 3) {
  const all = sim.needs?.getAll?.() ?? {};
  return Object.entries(all).sort((a, b) => a[1] - b[1]).slice(0, n);
}

// ── metrics ───────────────────────────────────────────────────────────────────
function metrics(g) {
  const rows = g.experimentLogger?._socialRows?.() ?? [];
  const total = rows.length;
  const negative = rows.filter(r => NEG.has(r.interactionType)).length;
  const acceptedPos = rows.filter(r => r.accepted && !NEG.has(r.interactionType)).length;
  const dyn = g.socialDynamics, sims = g.sims ?? [];
  let strongest = { t: '—', v: -Infinity }, resent = { t: '—', v: -Infinity }, isolated = 0;
  for (const a of sims) {
    let maxAff = -Infinity;
    for (const b of sims) {
      if (a.id === b.id) continue;
      const aff = dyn?.affinity(a.id, b.id) ?? 0;
      maxAff = Math.max(maxAff, aff);
      if (aff > strongest.v) strongest = { t: `${a.name}→${b.name}`, v: Math.round(aff) };
      const res = dyn?.get(a.id, b.id)?.resentment ?? 0;
      if (res > resent.v) resent = { t: `${a.name}→${b.name}`, v: Math.round(res) };
    }
    if (maxAff < 15) isolated++;
  }
  const external = (() => { try { return g.experimentLogger?.externalSocialityMetrics?.() ?? {}; } catch { return {}; } })();
  return {
    total, negative, acceptedPos,
    conflictRate: total ? negative / total : 0,
    positiveRate: total ? acceptedPos / total : 0,
    isolationIndex: sims.length ? isolated / sims.length : 0,
    strongestBond: strongest.v > -Infinity ? `${strongest.t} (${strongest.v})` : '—',
    highestResentment: resent.v > 0 ? `${resent.t} (${resent.v})` : '—',
    external,
  };
}

// ── renderers ───────────────────────────────────────────────────────────────
function renderOverview(g) {
  const m = metrics(g);
  const pct = v => `${Math.round(v * 100)}%`;
  const card = (big, lbl) => `<div class="card"><span class="big">${big}</span><span class="lbl">${lbl}</span></div>`;
  const pop = g.population;
  return `
    <h2>Key metrics</h2>
    <div class="grid cards">
      ${card(g.clock?.day ?? 0, 'sim day')}
      ${card(pop?.allPeople?.().length ?? g.sims?.length ?? 0, 'total population')}
      ${card(pop?.householdMembers?.().length ?? g.sims?.length ?? 0, 'household')}
      ${card(pop?.activeVisitors?.().length ?? 0, 'active visitors')}
      ${card(pop?.offLotPeople?.().length ?? 0, 'off-lot people')}
      ${card(m.total, 'social events')}
      ${card(pct(m.conflictRate), 'conflict rate')}
      ${card(pct(m.positiveRate), 'positive rate')}
      ${card(pct(m.isolationIndex), 'isolation index')}
      ${card(pct(m.external.visitAcceptanceRate ?? 0), 'visit acceptance')}
      ${card(m.external.averageVisitDuration ?? 0, 'avg visit duration')}
      ${card(pct(m.external.externalInteractionRate ?? 0), 'external interaction rate')}
      ${card(m.external.outsideNetworkSize ?? 0, 'outside network')}
      ${card(m.strongestBond, 'strongest bond')}
      ${card(m.highestResentment, 'highest resentment')}
    </div>
    <h2>Per-Sim activity</h2>
    ${renderSummaryBySim(g)}`;
}

function renderHealth(g) {
  const h = (() => { try { return g.experimentLogger?.simulationHealthMetrics?.() ?? {}; } catch { return {}; } })();
  const pct = v => `${Math.round((v ?? 0) * 100)}%`;
  const card = (big, lbl) => `<div class="card"><span class="big">${big}</span><span class="lbl">${lbl}</span></div>`;
  const needRows = Object.entries(h.needCrisesByNeed ?? {}).sort((a, b) => b[1] - a[1]);
  const healthNotes = [
    (h.needCrises ?? 0) > 20 ? 'Need crises are frequent: verify furniture availability, action preemption and route reachability.' : 'Need crises are within the expected observation range.',
    (h.stuckVisitors ?? 0) > 0 ? 'There are stuck visitors: check visitor lifecycle and exit routing.' : 'No stuck active visitors detected.',
    (h.negativeSocialRate ?? 0) < 0.05 && (h.socialAcceptanceRate ?? 0) > 0.85 ? 'Sociality is still very positive: consider stronger resentment seeds or acceptance penalties.' : 'Social mix has some rejection/conflict signal.',
    (h.offLotTransitionsPerPerson ?? 0) > 8 ? 'Off-lot churn is high: increase minimum state durations.' : 'Off-lot state churn is controlled.',
  ];
  return `
    <h2>Simulation health</h2>
    <div class="grid cards">
      ${card(h.needCrises ?? 0, 'need crises')}
      ${card(h.topNeedCrisisSim || '—', 'top crisis Sim')}
      ${card(h.activeVisitors ?? 0, 'active visitors')}
      ${card(h.stuckVisitors ?? 0, 'stuck visitors')}
      ${card(h.offLotTransitions ?? 0, 'off-lot transitions')}
      ${card(h.offLotTransitionsPerPerson ?? 0, 'transitions / off-lot person')}
      ${card(pct(h.socialAcceptanceRate), 'social acceptance')}
      ${card(pct(h.negativeSocialRate), 'negative social rate')}
      ${card(h.legacySocialEvents ?? 0, 'legacy social events')}
    </div>
    <h2>Need crisis mix</h2>
    ${needRows.length ? `<table><thead><tr><th>Need</th><th>Crises</th></tr></thead><tbody>${
      needRows.map(([need, count]) => `<tr><td>${esc(need)}</td><td>${count}</td></tr>`).join('')
    }</tbody></table>` : '<div class="muted">No need crises logged.</div>'}
    <h2>Suggestions</h2>
    <div class="summary">${healthNotes.map(n => `<div>${esc(n)}</div>`).join('')}</div>`;
}

function renderVisitors(g) {
  const pop = g.population;
  const vs = g.visitorSystem;
  const m = (() => { try { return g.experimentLogger?.externalSocialityMetrics?.() ?? {}; } catch { return {}; } })();
  const person = id => pop?.getPerson?.(id)?.name ?? id;
  const active = vs?.activeVisits?.() ?? [];
  const history = vs?.history?.().slice(-60).reverse() ?? [];
  const offlot = pop?.offLotPeople?.() ?? [];
  const cards = `<div class="grid cards">
    <div class="card"><span class="big">${active.length}</span><span class="lbl">active visits</span></div>
    <div class="card"><span class="big">${Math.round((m.visitAcceptanceRate ?? 0) * 100)}%</span><span class="lbl">acceptance</span></div>
    <div class="card"><span class="big">${m.rejectedVisits ?? 0}</span><span class="lbl">rejected</span></div>
    <div class="card"><span class="big">${m.noAnswerVisits ?? 0}</span><span class="lbl">no answer</span></div>
    <div class="card"><span class="big">${m.mostFrequentVisitor || '—'}</span><span class="lbl">frequent visitor</span></div>
    <div class="card"><span class="big">${m.mostVisitedHost || '—'}</span><span class="lbl">visited host</span></div>
  </div>`;
  const activeTable = active.length ? `<table><thead><tr><th>Visitor</th><th>Host</th><th>State</th><th>Reason</th><th>Entry</th><th>Outcome</th></tr></thead><tbody>${
    active.map(v => `<tr><td><b>${esc(person(v.personId))}</b></td><td>${esc(person(v.hostId))}</td><td>${esc(v.state)}</td><td>${esc(v.reason)}</td><td>${esc(v.entryPointId)}</td><td>${esc(v.outcome ?? '')}</td></tr>`).join('')
  }</tbody></table>` : '<div class="muted">No active visitors.</div>';
  const histTable = history.length ? `<table><thead><tr><th>Visitor</th><th>Host</th><th>Reason</th><th>Outcome</th><th>Entered</th><th>Left</th><th>Social</th></tr></thead><tbody>${
    history.map(v => `<tr><td>${esc(person(v.personId))}</td><td>${esc(person(v.hostId))}</td><td>${esc(v.reason)}</td><td>${esc(v.outcome)}</td><td>${v.enteredTick ?? '—'}</td><td>${v.actualLeftTick ?? '—'}</td><td>${v.socialSummary?.interactions ?? 0}</td></tr>`).join('')
  }</tbody></table>` : '<div class="muted">No completed visits yet.</div>';
  const offTable = offlot.length ? `<table><thead><tr><th>Person</th><th>Role</th><th>State</th><th>Availability</th><th>Last seen</th></tr></thead><tbody>${
    offlot.map(p => `<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.role)}</td><td>${esc(p.offLotState)}</td><td>${p.availability?.from ?? 0}-${p.availability?.to ?? 24}</td><td>${p.lastSeenAt ?? '—'}</td></tr>`).join('')
  }</tbody></table>` : '<div class="muted">No off-lot people.</div>';
  return `${cards}<h2>Active visitors</h2>${activeTable}<h2>Recent visits</h2>${histTable}<h2>Off-lot population</h2>${offTable}`;
}

function renderSummaryBySim(g) {
  let s = {};
  try { s = g.experimentLogger?.summaryBySim?.() ?? {}; } catch {}
  const rows = Object.values(s);
  if (rows.length === 0) return '<div class="muted">No interactions logged yet.</div>';
  return `<table><thead><tr><th>Sim</th><th>Initiated</th><th>Accepted</th><th>Positive</th><th>Negative</th><th>Top motive</th></tr></thead><tbody>${
    rows.map(r => {
      const topMotive = Object.entries(r.motives ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
      return `<tr><td>${esc(r.name ?? r.simId)}</td><td>${r.total}</td><td>${pctRate(r.acceptanceRate)}</td>
        <td class="pos">${r.positive}</td><td class="neg">${r.negative}</td><td class="muted">${esc(topMotive)}</td></tr>`;
    }).join('')
  }</tbody></table>`;
}
const pctRate = v => `${Math.round((v ?? 0) * 100)}%`;

function renderSims(g) {
  const sims = g.sims ?? [];
  if (sims.length === 0) return '<div class="empty">No Sims.</div>';
  return `<h2>Sims (${sims.length})</h2>
  <table><thead><tr>
    <th>Name</th><th>Stage</th><th>Career</th><th>§</th><th>Mood</th><th>Lowest needs</th><th>Active goal</th><th>Emotion</th><th>Mem</th>
  </tr></thead><tbody>${
    sims.map(sim => {
      const { age, career } = info(g, sim);
      const needs = lowestNeeds(sim).map(([k, v]) =>
        `<div class="dimrow" style="grid-template-columns:54px 1fr 26px;margin:0"><span class="k">${k}</span>
          <span class="bar"><i style="width:${Math.round(v)}%;background:${v < 25 ? '#ef9a9a' : '#80cbc4'}"></i></span>
          <span class="v">${Math.round(v)}</span></div>`).join('');
      const goal = sim.brain?.goalSystem?.activeGoals?.()[0];
      const emo = sim.brain?.emotions?.tier ?? sim._moodLabel ?? '—';
      const memN = sim.brain?.memory?.count ?? 0;
      const atWork = career?.atWork ? ' <span class="pill" style="background:rgba(129,199,132,.25);color:#a5d6a7">at work</span>' : '';
      return `<tr>
        <td><b>${esc(sim.name)}</b></td>
        <td>${esc(age?.stage?.label ?? '—')} <span class="muted">${age ? Math.round(age.ageYears) : ''}</span></td>
        <td>${esc(career?.career?.label ?? '—')} <span class="muted">Lv${career?.level ?? 0}</span>${atWork}</td>
        <td>${career ? Math.floor(career.simoleons) : 0}</td>
        <td>${esc(sim._moodLabel ?? '—')}</td>
        <td><div class="needbars">${needs}</div></td>
        <td>${goal ? esc(goal.label) : '<span class="muted">—</span>'}</td>
        <td>${esc(emo)}</td>
        <td>${memN}</td>
      </tr>`;
    }).join('')
  }</tbody></table>`;
}

function renderRel(g) {
  const dyn = g.socialDynamics, sims = peopleForRelationships(g);
  if (!dyn || sims.length === 0) return '<div class="empty">No relationship data.</div>';
  if (!selPair && sims.length >= 2) selPair = [sims[0].id, sims[1].id];

  const opts = ['affinity', ...DIMENSIONS].map(d => `<option value="${d}"${d === relDim ? ' selected' : ''}>${d}</option>`).join('');
  let mtx = '<table class="mtx"><tr><th></th>';
  for (const c of sims) mtx += `<th>${esc(c.name[0])}</th>`;
  mtx += '</tr>';
  for (const r of sims) {
    mtx += `<tr><th style="text-align:right">${esc(r.name)}</th>`;
    for (const c of sims) {
      if (r.id === c.id) { mtx += '<td><div class="cell diag">·</div></td>'; continue; }
      let v, bg;
      if (relDim === 'affinity') { v = Math.round(dyn.affinity(r.id, c.id)); bg = divergeAff(v); }
      else { v = Math.round(dyn.get(r.id, c.id)[relDim] ?? 0); bg = dimColor(relDim, v); }
      const sel = selPair && selPair[0] === r.id && selPair[1] === c.id ? ' sel' : '';
      mtx += `<td><div class="cell${sel}" data-from="${r.id}" data-to="${c.id}" style="background:${bg}">${v}</div></td>`;
    }
    mtx += '</tr>';
  }
  mtx += '</table>';

  return `<h2>Relationship matrix — row → column
      &nbsp; <select id="rel-dim">${opts}</select></h2>
    ${mtx}
    <h2>Pair deep-dive</h2>
    ${renderPair(g)}`;
}

function dimBars(dims) {
  return DIMENSIONS.map(d => {
    const v = Math.round(dims[d] ?? 0);
    return `<div class="dimrow"><span class="k">${d}</span>
      <span class="bar"><i style="width:${v}%;background:${dimColor(d, v)}"></i></span>
      <span class="v">${v}</span></div>`;
  }).join('');
}

function renderPair(g) {
  const dyn = g.socialDynamics;
  if (!selPair) return '<div class="muted">Click a matrix cell.</div>';
  const [a, b] = selPair;
  let exAB, exBA;
  try { exAB = dyn.explainRelation(a, b); exBA = dyn.explainRelation(b, a); } catch { return '<div class="muted">—</div>'; }
  const timeline = (() => { try { return g.experimentLogger?.relationshipTimeline?.([a, b]) ?? []; } catch { return []; } })();
  const tl = timeline.slice(-18).reverse().map(e => `<tr>
      <td class="muted">D${e.simDay}</td>
      <td>${esc(personName(g, e.actorId))}</td>
      <td><b class="${NEG.has(e.interactionType) ? 'neg' : 'pos'}">${esc(e.interactionType)}</b></td>
      <td>${esc(personName(g, e.targetId))}</td>
      <td>${e.accepted ? '✓' : '✗'}</td>
      <td class="muted">${esc(e.dominantMotive ?? '')}</td>
      <td>${e.relationshipAfter ?? ''}</td></tr>`).join('');

  const col = (ex) => `<div>
      <div class="summary"><b>${esc(ex.fromName)} → ${esc(ex.toName)}</b>
        <span class="tag">${esc(ex.label)} · affinity ${ex.affinity}</span><br>${esc(ex.summary)}</div>
      ${dimBars(ex.dims)}</div>`;

  return `<div class="two-col">${col(exAB)}${col(exBA)}</div>
    <h2>Interaction timeline (${timeline.length})</h2>
    ${timeline.length ? `<table><thead><tr><th>Day</th><th>Actor</th><th>Action</th><th>Target</th><th>OK</th><th>Motive</th><th>Rel→</th></tr></thead><tbody>${tl}</tbody></table>`
      : '<div class="muted">No interactions between this pair yet.</div>'}`;
}

function renderEvents(g) {
  let rows = [];
  try { rows = (g.experimentLogger?.events ?? []).filter(e => e.type === 'social:interaction' || e.type?.startsWith?.('visitor:') || e.type?.startsWith?.('offlot:')); } catch {}
  if (rows.length === 0) return '<div class="empty">No events logged yet.</div>';
  const recent = rows.slice(-120).reverse();
  return `<h2>Recent experiment events (${rows.length} total)</h2>
    <table><thead><tr>
      <th>Day</th><th>Hr</th><th>Type</th><th>Actor/Visitor</th><th>Action/State</th><th>Target/Host</th><th>OK</th><th>Reason</th><th>Location</th><th>Rel→</th><th>Δ</th>
    </tr></thead><tbody>${
      recent.map(e => e.type === 'social:interaction' ? `<tr>
        <td class="muted">${e.simDay}</td><td class="muted">${e.simHour}</td>
        <td>${esc(e.type)}</td>
        <td>${esc(e.actorName)}</td>
        <td><b class="${NEG.has(e.interactionType) ? 'neg' : (e.accepted ? 'pos' : 'neu')}">${esc(e.interactionType)}</b></td>
        <td>${esc(e.targetName)}</td>
        <td>${e.accepted ? '✓' : '✗'}</td>
        <td class="muted">${esc(e.dominantMotive)}</td>
        <td class="muted">${esc(e.location)}</td>
        <td>${e.relationshipAfter}</td>
        <td>${e.delta}</td></tr>` : `<tr>
        <td class="muted">${e.simDay}</td><td class="muted">${e.simHour}</td>
        <td>${esc(e.type)}</td>
        <td>${esc(e.visitorName ?? e.personName ?? e.visitorId ?? e.personId ?? '')}</td>
        <td><b class="neu">${esc(e.state ?? e.outcome ?? '')}</b></td>
        <td>${esc(e.hostName ?? e.hostId ?? '')}</td>
        <td>${e.accepted ? '✓' : ''}</td>
        <td class="muted">${esc(e.reason ?? '')}</td>
        <td class="muted">${esc(e.entryPointId ?? '')}</td>
        <td>${e.relationshipAfter ?? ''}</td>
        <td>${e.delta ?? ''}</td></tr>`).join('')
    }</tbody></table>`;
}

function peopleForRelationships(g) {
  const people = g.population?.allPeople?.();
  if (!people) return g.sims ?? [];
  return people.map(p => g.sims?.find?.(s => s.id === p.id) ?? p);
}

function personName(g, id) {
  return g.sims?.find?.(s => s.id === id)?.name ?? g.population?.getPerson?.(id)?.name ?? id;
}

// ── main render loop ──────────────────────────────────────────────────────────
function render() {
  const g = game();
  const content = $('content');
  if (!g) {
    $('subtitle').textContent = '';
    content.innerHTML = '<div class="empty">In attesa del gioco…<br>Apri questa pagina dal pulsante 🧪 Lab nel gioco (e tieni quella scheda aperta).</div>';
    return;
  }
  $('subtitle').textContent = `${g.householdName ?? 'Household'} · Day ${g.clock?.day ?? 0} · ${g.clock?.hour != null ? String(Math.floor(g.clock.hour)).padStart(2, '0') + ':00' : ''} · ${g.sims?.length ?? 0} Sims`;
  try {
    if (activeTab === 'overview') content.innerHTML = renderOverview(g);
    else if (activeTab === 'health') content.innerHTML = renderHealth(g);
    else if (activeTab === 'sims') content.innerHTML = renderSims(g);
    else if (activeTab === 'visitors') content.innerHTML = renderVisitors(g);
    else if (activeTab === 'rel')  content.innerHTML = renderRel(g);
    else if (activeTab === 'events') content.innerHTML = renderEvents(g);
  } catch (err) {
    content.innerHTML = `<div class="empty">Render error: ${esc(err.message)}</div>`;
  }
  bindContent();
}

function bindContent() {
  $('rel-dim')?.addEventListener('change', e => { relDim = e.target.value; render(); });
  document.querySelectorAll('.cell[data-from]').forEach(c =>
    c.addEventListener('click', () => { selPair = [c.dataset.from, c.dataset.to]; render(); }));
}

function download(name, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

// ── boot ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  activeTab = t.dataset.tab;
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
  render();
}));
$('btn-refresh').addEventListener('click', render);
$('btn-csv').addEventListener('click', () => { const g = game(); if (g) download('experiment-log.csv', g.experimentLogger.toCSV(), 'text/csv'); });
$('btn-json').addEventListener('click', () => { const g = game(); if (g) download('experiment-log.json', g.experimentLogger.toJSON(), 'application/json'); });

render();
setInterval(render, POLL_MS);
window.addEventListener('beforeunload', () => {});

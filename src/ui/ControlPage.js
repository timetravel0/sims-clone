/**
 * ControlPage — unified God/Admin page (toolbar "⚡ God/Admin", like Life/Lab).
 *
 * Runs in the game's own context (opener-side, like LifePage), so every control
 * mutates the LIVE game / cfg singleton directly → immediate effect. Two parts:
 *   • Parameters: numeric knobs (time, need decay, health/illness, world meanness)
 *     that systems read live (DayNightCycle, SimNeeds, HealthSystem, UtilityAIPlanner).
 *     Edits also persist to config/gameConfig.json (debounced POST /admin/save) so
 *     they survive the next launch.
 *   • Macros (God): per-Sim Make Evil/Good, life events, give §; world levers
 *     (global meanness, make everyone evil/nice).
 *
 * The periodic refresh pauses while an INPUT/SELECT is focused so edits aren't
 * clobbered; control handlers use event delegation so they survive re-renders.
 */
import cfg from '../config/gameConfig.js';

// path → number setter on the cfg object (e.g. "time.dayDurationSec").
function setCfgPath(path, value) {
  const parts = path.split('.');
  let o = cfg;
  for (let i = 0; i < parts.length - 1; i++) { o[parts[i]] = o[parts[i]] ?? {}; o = o[parts[i]]; }
  o[parts[parts.length - 1]] = value;
}
function getCfgPath(path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), cfg);
}

// Parameter rows: [path, label, explanation, step]
const PARAM_GROUPS = [
  ['Tempo', [
    ['time.dayDurationSec', 'Durata giorno (sec reali a 1×)', 'Secondi reali per un giorno di gioco a 1×. 86400 = tempo reale; più basso = più veloce.', 600],
    ['time.defaultSpeed', 'Velocità di default (×)', 'Moltiplicatore di tempo all\'avvio. Applicato subito anche alla partita in corso.', 1],
  ]],
  ['Decadimento bisogni (al tick)', [
    ['decayScale', 'Scala globale decadimento', 'Moltiplica TUTTI i decadimenti. Più alto = i bisogni calano più in fretta.', 0.01],
    ['needDecay.hunger', 'Fame', 'Velocità con cui cala la fame.', 0.1],
    ['needDecay.energy', 'Energia', 'Velocità con cui cala l\'energia.', 0.1],
    ['needDecay.bladder', 'Vescica', 'Velocità con cui cala la vescica.', 0.1],
    ['needDecay.hygiene', 'Igiene', 'Velocità con cui cala l\'igiene.', 0.1],
    ['needDecay.social', 'Sociale', 'Velocità con cui cala il bisogno sociale.', 0.1],
    ['needDecay.fun', 'Divertimento', 'Velocità con cui cala il divertimento.', 0.1],
    ['needDecay.comfort', 'Comfort', 'Velocità con cui cala il comfort.', 0.1],
  ]],
  ['Salute / malattie', [
    ['health.illnessBase', 'Rischio base malattia', 'Probabilità base di ammalarsi per ciclo (~51 cicli/giorno). Tienilo molto basso.', 0.0002],
    ['health.illnessCap', 'Tetto rischio malattia', 'Probabilità massima per ciclo anche con tutti i bisogni a zero.', 0.005],
    ['health.illnessHygiene', 'Peso igiene', 'Quanto la scarsa igiene aumenta il rischio.', 0.001],
    ['health.illnessEnergy', 'Peso energia', 'Quanto la stanchezza aumenta il rischio.', 0.001],
    ['health.recoveryBase', 'Guarigione base (tick)', 'Tick minimi di malattia prima di passare a "in ripresa".', 10],
    ['health.recoverySeverity', 'Guarigione × gravità', 'Tick extra di malattia proporzionali alla gravità.', 10],
  ]],
  ['Mondo', [
    ['world.meanness', 'Cattiveria globale (0–1)', 'Spinge TUTTI i sim verso interazioni ostili (litigi, insulti). 0 = normale.', 0.05],
  ]],
];

const LIFE_EVENTS = [['promoted', '⬆️ Promosso'], ['fired', '⬇️ Licenziato'], ['heartbreak', '💔 Cuore spezzato'], ['windfall', '💰 Fortuna']];

export class ControlPage {
  constructor(game) {
    this._game = game;
    this._win = null;
    this._timer = null;
    this._saveTimer = null;
  }

  open() {
    if (this._win && !this._win.closed) { this._win.focus(); this._render(); return true; }
    const win = window.open('', 'sims-control', 'width=820,height=860');
    if (!win) return false;
    this._win = win;
    win.document.title = 'God / Admin';
    win.document.body.style.cssText =
      'margin:0;height:100vh;overflow-y:auto;background:#0e0d0b;color:#ddd;font-family:system-ui,sans-serif;font-size:13px';
    win.document.body.innerHTML = `
      <div style="position:sticky;top:0;z-index:1;background:#14130f;border-bottom:1px solid rgba(255,255,255,.1);padding:12px 18px;font-size:15px;font-weight:700;color:#fff">⚡ God / Admin <span style="color:#888;font-weight:400;font-size:11px">— le modifiche hanno effetto immediato</span></div>
      <div id="ctl-root" style="padding:16px;max-width:760px;margin:0 auto"></div>`;

    // Delegated handlers (survive re-renders).
    win.document.addEventListener('change', (e) => this._onChange(e));
    win.document.addEventListener('click', (e) => this._onClick(e));

    this._render();
    this._timer = win.setInterval(() => {
      if (win.closed) { this.close(); return; }
      const ae = win.document.activeElement?.tagName;
      if (ae === 'INPUT' || ae === 'SELECT') return; // don't clobber an edit in progress
      this._render();
    }, 2000);
    return true;
  }

  close() {
    if (this._timer && this._win) this._win.clearInterval(this._timer);
    this._timer = null; this._win = null;
  }

  _members() {
    const pop = this._game.population;
    return (this._game.sims ?? []).filter(s =>
      !s._isVisitor && !(pop?.getPerson?.(s.id)?.dead) && (pop?.isHouseholdMember?.(s.id) ?? true));
  }

  _render() {
    if (!this._win || this._win.closed) return;
    const root = this._win.document.getElementById('ctl-root');
    if (!root) return;

    const sect = (title, body) => `<div style="margin-bottom:18px"><div style="color:#ffd580;font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">${title}</div>${body}</div>`;
    const row = (path, label, explain, step) => {
      const v = getCfgPath(path);
      return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:7px">
        <label style="flex:1">${label}<div style="color:#777;font-size:10px">${explain}</div></label>
        <input class="ctl-cfg" data-path="${path}" type="number" step="${step}" value="${v}"
          style="width:120px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:6px;color:#eee;padding:5px 8px"/>
      </div>`;
    };

    let html = PARAM_GROUPS.map(([title, rows]) =>
      sect(title, rows.map(r => row(...r)).join(''))).join('');

    // Macros
    const opts = this._members().map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    const btn = (cls, label, extra = '') => `<button class="${cls}" ${extra} style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);color:#ddd;border-radius:6px;padding:5px 10px;cursor:pointer;margin:2px">${label}</button>`;
    html += sect('Macro — singolo sim', `
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <select id="ctl-sim" style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#eee;border-radius:6px;padding:5px 8px">${opts}</select>
        ${btn('ctl-evil', '😈 Rendi cattivo')}
        ${btn('ctl-good', '😇 Rendi buono')}
        ${btn('ctl-give', '💰 +§1000')}
      </div>
      <div>${LIFE_EVENTS.map(([t, l]) => btn('ctl-life', l, `data-ev="${t}"`)).join('')}</div>`);
    html += sect('Macro — mondo', `
      ${btn('ctl-all-evil', '😈 Tutti cattivi')}
      ${btn('ctl-all-good', '😇 Tutti buoni')}
      ${btn('ctl-give-hh', '💰 +§5000 alla famiglia')}`);

    root.innerHTML = html;
  }

  _onChange(e) {
    const el = e.target;
    if (!el.classList?.contains('ctl-cfg')) return;
    const path = el.dataset.path;
    const value = Number(el.value);
    if (!Number.isFinite(value)) return;
    setCfgPath(path, value);
    if (path === 'time.defaultSpeed') this._game.setSpeed?.(value); // apply to running game now
    this._persist();
  }

  _onClick(e) {
    const g = this._game, t = e.target;
    const simId = this._win.document.getElementById('ctl-sim')?.value;
    const sim = g.sims?.find(s => s.id === simId);
    if (t.classList.contains('ctl-evil') && sim) g.godMode?.setTrait?.(sim, 'nice', -0.85);
    else if (t.classList.contains('ctl-good') && sim) g.godMode?.setTrait?.(sim, 'nice', 0.85);
    else if (t.classList.contains('ctl-give') && sim) g.budgetSystem?.credit?.(1000, 'god');
    else if (t.classList.contains('ctl-life') && sim) g.godMode?.lifeEvent?.(sim, t.dataset.ev);
    else if (t.classList.contains('ctl-all-evil')) this._members().forEach(s => g.godMode?.setTrait?.(s, 'nice', -0.85));
    else if (t.classList.contains('ctl-all-good')) this._members().forEach(s => g.godMode?.setTrait?.(s, 'nice', 0.85));
    else if (t.classList.contains('ctl-give-hh')) g.budgetSystem?.credit?.(5000, 'god');
  }

  /** Debounced write of the whole cfg to disk (dev-server /admin/save). */
  _persist() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      try { fetch('/admin/save', { method: 'POST', body: JSON.stringify(cfg, null, 2) }).catch(() => {}); }
      catch { /* best-effort; immediate in-memory effect already applied */ }
    }, 800);
  }
}

/**
 * LifePage — opens a separate browser window listing every LIVING household
 * member with rich live info (life stage, mood, full needs, career + change
 * picker, skills, active goals, today's schedule, health + doctor call, family,
 * location). Rendered from the opener's game objects and refreshed on a timer.
 *
 * Interactive controls (career picker, doctor button) survive the periodic
 * re-render via event delegation on the window document, and the refresh pauses
 * while a <select> is focused so an open picker isn't snapped shut.
 */
import { bus } from '../core/EventBus.js';
import { CAREERS } from '../systems/CareerSystem.js';
import { educationLabel } from '../config/familyRules.js';
import { describeLocation } from '../systems/LocationService.js';

const SKILL_LABELS = { creativity:'🎨', logic:'🔬', cooking:'🍳', fitness:'💪', charisma:'💬' };
const NEED_LABELS = {
  hunger:'Hunger', energy:'Energy', bladder:'Bladder', hygiene:'Hygiene',
  social:'Social', fun:'Fun', comfort:'Comfort', room:'Ambiente', autonomy:'Autonomia',
};
const DAY_LABELS = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];

export class LifePage {
  constructor(game) {
    this._game = game;
    this._win = null;
    this._timer = null;
    // A death anywhere refreshes the page immediately so the Sim drops off.
    bus.on('sim:died', () => this._render());
  }

  /** Open (or focus) the Life window and start refreshing it. */
  open() {
    if (this._win && !this._win.closed) { this._win.focus(); this._render(); return true; }
    const win = window.open('', 'sims-life', 'width=960,height=780');
    if (!win) return false; // popup blocked — caller can fall back
    this._win = win;
    win.document.title = 'Famiglia — Life';
    // Body itself is the scroll container (height-bounded + overflow), so long
    // rosters scroll instead of overflowing off-screen.
    win.document.body.style.cssText =
      'margin:0;height:100vh;overflow-y:auto;background:#0e0d0b;color:#ddd;font-family:system-ui,sans-serif';
    win.document.body.innerHTML = `
      <div style="position:sticky;top:0;z-index:1;background:#14130f;border-bottom:1px solid rgba(255,255,255,.1);padding:12px 18px;font-size:15px;font-weight:700;color:#fff">👪 La Famiglia</div>
      <div id="life-root" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:14px;padding:16px"></div>`;

    // Delegated handlers (attached once; survive root re-renders).
    win.document.addEventListener('change', (e) => {
      const sel = e.target;
      if (sel?.classList?.contains?.('life-career')) {
        this._game.careerSystem?.switchCareer?.(sel.dataset.sim, sel.value);
        this._render();
      }
    });
    win.document.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('.life-doctor');
      if (btn) { this._game.doctor?.book?.(btn.dataset.sim); this._render(); }
    });

    this._render();
    this._timer = win.setInterval(() => {
      if (win.closed) { this.close(); return; }
      // Don't yank an open career picker shut mid-selection.
      if (win.document.activeElement?.tagName === 'SELECT') return;
      this._render();
    }, 1500);
    return true;
  }

  close() {
    if (this._timer && this._win) this._win.clearInterval(this._timer);
    this._timer = null;
    this._win = null;
  }

  /** Living, controllable household members only (dead Sims drop off). */
  _members() {
    const pop = this._game.population;
    return (this._game.sims ?? []).filter(s =>
      !s._isVisitor &&
      !(pop?.getPerson?.(s.id)?.dead) &&
      (pop?.isHouseholdMember?.(s.id) ?? true));
  }

  _render() {
    if (!this._win || this._win.closed) return;
    const root = this._win.document.getElementById('life-root');
    if (!root) return;
    const members = this._members();
    root.innerHTML = members.length
      ? members.map(s => this._cardHTML(s)).join('')
      : '<p style="color:#666;padding:20px">Nessun membro della famiglia.</p>';
  }

  _cardHTML(sim) {
    const game = this._game;
    const age    = game.ageSystem?.getInfo(sim.id);
    const career = game.careerSystem?.getInfo(sim.id);
    const person = game.population?.getPerson?.(sim.id);
    const card = (body) => `<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:14px 16px">${body}</div>`;
    const box  = (body) => `<div style="background:rgba(255,255,255,.05);border-radius:7px;padding:8px 10px;margin-bottom:10px">${body}</div>`;
    const head = (t) => `<div style="color:#888;font-size:10px;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">${t}</div>`;

    let h = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">`;
    h += `<span style="width:14px;height:14px;border-radius:50%;background:#${(sim.color ?? 0x8888aa).toString(16).padStart(6,'0')}"></span>`;
    h += `<span style="font-size:14px;font-weight:700;color:#fff">${sim.name}</span>`;
    if (age) h += `<span style="background:${age.stage.color};color:#111;font-size:10px;font-weight:700;padding:2px 8px;border-radius:12px">${age.stage.label}</span>`;
    if (age) h += `<span style="color:#aaa;font-size:11px">${age.ageYears}y</span>`;
    h += `</div>`;
    const mood = sim._moodLabel || (sim.brain?.emotions?.tier);
    if (mood) h += `<div style="color:#80cbc4;font-size:11px;margin-bottom:8px">😊 ${mood}${sim.currentAction ? ` · ${sim.currentAction}` : ''}</div>`;

    // Needs
    const needs = sim.needs?.getAll?.() ?? {};
    let nh = '';
    for (const [k, label] of Object.entries(NEED_LABELS)) {
      if (needs[k] == null) continue;
      const v = Math.round(needs[k]);
      const col = v < 25 ? '#ef5350' : v < 50 ? '#ffb74d' : '#81c784';
      nh += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
        <span style="width:72px;color:#bbb;font-size:10px">${label}</span>
        <div style="flex:1;height:5px;background:rgba(255,255,255,.1);border-radius:3px;overflow:hidden"><div style="width:${v}%;height:100%;background:${col}"></div></div>
        <span style="width:24px;text-align:right;color:#777;font-size:10px">${v}</span></div>`;
    }
    h += box(head('Needs') + nh);

    // Career + money + health + doctor + family + education
    if (career) {
      const c = career.career;
      let cb = `<div style="display:flex;justify-content:space-between"><span style="color:#eee;font-weight:700">${c.emoji} ${c.label}</span><span style="color:#ffd580">Lv.${career.level}</span></div>`;
      cb += `<div style="display:flex;justify-content:space-between;margin-top:4px;color:#aaa"><span>💰 §${Math.floor(career.simoleons).toLocaleString()}</span>${career.atWork ? '<span style="color:#81c784">▶ Al lavoro</span>' : '<span style="color:#888">🏠 Casa</span>'}</div>`;
      // Career picker (the "force the job" menu the user missed).
      cb += `<select class="life-career" data-sim="${sim.id}" style="width:100%;margin-top:8px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:6px;color:#eee;padding:4px 8px;font-size:11px">`;
      for (const cc of CAREERS) {
        const sel = cc.id === career.careerId ? 'selected' : '';
        cb += `<option value="${cc.id}" ${sel}>${cc.emoji} ${cc.label} · §${cc.salaryPerDay}/g</option>`;
      }
      cb += `</select>`;
      h += box(cb);
    }
    if (person) {
      const nameOf = (id) => game.population?.getPerson?.(id)?.name;
      const names = (ids) => (ids ?? []).map(nameOf).filter(Boolean).join(', ');
      const partner = game.population?.getPerson?.(person.partnerId)?.name ?? '—';
      const parents  = names(person.parentIds) || '—';
      const children = names(person.childIds)  || '—';
      const edu = educationLabel(person.education ?? 0);
      const ill = person.health && person.health.state !== 'healthy';
      const hp = ill
        ? `<span style="color:#ffab91">${person.health.state} · ${person.health.illness ?? '?'}</span>`
        : `<span style="color:#9ccc65">Sano</span>`;
      let fb = `<div style="color:#aaa">Partner: <span style="color:#ddd">${partner}</span></div>
        <div style="color:#aaa;margin-top:4px">👪 Genitori: <span style="color:#ddd">${parents}</span></div>
        <div style="color:#aaa;margin-top:4px">🧒 Figli: <span style="color:#ddd">${children}</span></div>
        <div style="color:#aaa;margin-top:4px">🎓 ${edu} · Salute: ${hp}</div>`;
      if (ill) {
        const booked = game.doctor?._pending?.has?.(sim.id);
        fb += booked
          ? `<div style="margin-top:6px;color:#80cbc4">🩺 Visita medica in arrivo…</div>`
          : `<button class="life-doctor" data-sim="${sim.id}" style="margin-top:6px;background:#2a4a5a;border:1px solid #3a6a7a;color:#cde;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:11px">🩺 Chiama il dottore</button>`;
      }
      h += box(fb);
    }

    // Skills (compact)
    if (career?.skills) {
      const skills = Object.entries(SKILL_LABELS)
        .map(([k, e]) => `${e}${(career.skills[k] ?? 0).toFixed(1)}`).join('  ');
      h += box(head('Skills') + `<div style="color:#bbb;font-size:11px">${skills}</div>`);
    }

    // Active goals
    const goals = sim.brain?.goalSystem?.activeGoals?.() ?? [];
    if (goals.length) {
      let gb = head('Obiettivi');
      for (const g of goals) {
        const pct = Math.round((g.progress ?? 0) * 100);
        gb += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
          <span style="flex:1;color:#bbb;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${g.label ?? g.type}</span>
          <span style="color:#777;font-size:10px">${pct}%</span></div>`;
      }
      h += box(gb);
    }

    // Today's schedule
    const day = Math.floor(game.dayNight?.totalDays ?? 0) % 7;
    const slots = (game.scheduleSystem?.getSchedule?.(sim.id) ?? [])
      .filter(s => s.day === day).sort((a, b) => a.startHour - b.startHour);
    if (slots.length) {
      const hour = game.clock?.hour ?? 0;
      let sb = head(`Agenda (${DAY_LABELS[day]})`);
      for (const s of slots) {
        const active = hour >= s.startHour && hour < s.endHour;
        sb += `<div style="color:${active ? '#4fc3f7' : '#999'};font-size:10px">${s.startHour}:00–${s.endHour}:00 · ${s.label}</div>`;
      }
      h += box(sb);
    }

    // Location
    const loc = describeLocation(sim, { roomDetector: game.roomDetector, world: game.world });
    const where = loc.mode === 'on_lot' ? loc.roomType : loc.mode;
    h += `<div style="color:#888;font-size:11px">📍 ${where} · ${loc.activity}${loc.reason ? ` · ${loc.reason}` : ''}</div>`;

    return card(h);
  }
}

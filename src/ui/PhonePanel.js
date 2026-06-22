import { bus }           from '../core/EventBus.js';
import { socialManager } from '../systems/SocialManager.js';

/**
 * PhonePanel — appears when a Sim uses the phone object.
 * Lists known contacts and lets the player choose an action:
 *   💬 Chatta        — piccolo boost social/mood, segna interazione
 *   🏠 Invita a casa — scheduleVisit (force)
 *   🚗 Gita insieme  — forceOuting 'trip' (caller + eventuale household target)
 *   🍽️ Fuori a cena  — forceOuting 'meal_out' (idem)
 */
export class PhonePanel {
  constructor(game) {
    this._game = game;
    this._el   = this._build();
    document.body.appendChild(this._el);
    bus.on('phone:used', ({ sim }) => this._open(sim));
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'phone-panel';
    el.style.cssText = [
      'display:none', 'position:fixed', 'top:50%', 'left:50%',
      'transform:translate(-50%,-50%)', 'z-index:200',
      'width:340px', 'max-height:70vh', 'overflow-y:auto',
      'background:rgba(14,13,11,0.97)', 'backdrop-filter:blur(12px)',
      'border:1px solid rgba(255,255,255,0.12)', 'border-radius:12px',
      'padding:16px', 'color:#ddd', 'font-family:system-ui,sans-serif',
      'font-size:12px', 'box-shadow:0 8px 32px rgba(0,0,0,0.7)',
    ].join(';');
    return el;
  }

  _open(sim) {
    const game = this._game;
    const all  = game.population?.allPeople?.() ?? game.sims ?? [];
    const contacts = all.filter(p =>
      p.id !== sim.id &&
      !p.dead &&
      socialManager.familiarity(sim.id, p.id) > 0
    ).sort((a, b) =>
      socialManager.familiarity(sim.id, b.id) - socialManager.familiarity(sim.id, a.id)
    );

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="color:#fff;font-size:13px;font-weight:700">📱 ${sim.name} — Telefona</span>
        <button id="phone-close" style="background:none;border:none;color:#888;cursor:pointer;font-size:16px">✕</button>
      </div>`;

    if (contacts.length === 0) {
      html += `<p style="color:#666;text-align:center;padding:20px">Nessun contatto ancora.</p>`;
    } else {
      for (const p of contacts.slice(0, 10)) {
        const fam    = Math.round(socialManager.familiarity(sim.id, p.id));
        const isHome = game.sims?.some(s => s.id === p.id && !s._isVisitor && !s._atWork && !s._outing);
        html += `
          <div style="border-bottom:1px solid rgba(255,255,255,0.07);padding:8px 0">
            <div style="color:#ccc;margin-bottom:6px">
              ${p.name} <span style="color:#555;font-size:10px">fam. ${fam}</span>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="ph-btn" data-action="chat"   data-pid="${p.id}" data-pname="${p.name}">💬 Chatta</button>
              <button class="ph-btn" data-action="invite" data-pid="${p.id}" data-pname="${p.name}">🏠 Invita</button>
              <button class="ph-btn" data-action="trip"   data-pid="${p.id}" data-pname="${p.name}" ${isHome?'':'style="opacity:.45"'}>🚗 Gita</button>
              <button class="ph-btn" data-action="meal"   data-pid="${p.id}" data-pname="${p.name}" ${isHome?'':'style="opacity:.45"'}>🍽️ Cena fuori</button>
            </div>
          </div>`;
      }
    }

    this._el.innerHTML = html;
    this._el.querySelectorAll('.ph-btn').forEach(btn => {
      btn.style.cssText += ';background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#ddd;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:11px;';
      btn.addEventListener('click', () => {
        this._act(sim, btn.dataset.action, btn.dataset.pid, btn.dataset.pname);
        this._close();
      });
    });
    this._el.querySelector('#phone-close')?.addEventListener('click', () => this._close());
    this._el.style.display = 'block';
  }

  _act(callerSim, action, targetId, targetName) {
    const game = this._game;
    switch (action) {
      case 'chat': {
        callerSim.needs?.restore?.('social', 12);
        callerSim.needs?.restore?.('fun',    5);
        socialManager.applyOutcome(callerSim.id, targetId, 4, 3, 'phone_chat');
        bus.emit('story:entry', { text: `${callerSim.name} ha chattato al telefono con ${targetName}.`, cat: 'social' });
        break;
      }
      case 'invite': {
        const result = game.visitorSystem?.scheduleVisit?.(targetId, callerSim.id, 'invited_call', { force: true });
        if (result) {
          bus.emit('story:entry', { text: `${callerSim.name} ha invitato ${targetName} a casa.`, cat: 'social' });
        } else {
          bus.emit('story:entry', { text: `${targetName} non è disponibile a venire.`, cat: 'neutral' });
        }
        break;
      }
      case 'trip':
      case 'meal': {
        const reason = action === 'meal' ? 'meal_out' : 'trip';
        if (!game.offLotSimulation) break;
        // Caller goes out
        if (!callerSim._atWork && !callerSim._outing) {
          game.offLotSimulation.forceOuting(callerSim, reason);
        }
        // If target is a household sim on the lot, invite them too
        const targetSim = game.sims?.find(s => s.id === targetId && !s._isVisitor && !s._atWork && !s._outing);
        if (targetSim) game.offLotSimulation.forceOuting(targetSim, reason);
        bus.emit('story:entry', {
          text: `${callerSim.name} ha organizzato ${reason === 'meal_out' ? 'una cena fuori' : 'una gita'} con ${targetName}.`,
          cat: 'family',
        });
        break;
      }
    }
  }

  _close() { this._el.style.display = 'none'; }
}

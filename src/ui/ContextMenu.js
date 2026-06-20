import { bus } from '../core/EventBus.js';

/**
 * ContextMenu — right-click on a Sim or furniture tile shows available
 * player-driven actions.
 *
 * THREE is accessed via window._THREE (set in main.js before any module loads).
 * game.camera → IsometricCamera wrapper → .camera → THREE.Camera
 */
export class ContextMenu {
  constructor(game, renderer) {
    this._game      = game;
    this._renderer  = renderer;
    this._el        = this._build();
    document.body.appendChild(this._el);
    this._hide();

    renderer.domElement.addEventListener('contextmenu', e => {
      e.preventDefault();
      this._onRightClick(e);
    });
    document.addEventListener('click',   () => this._hide());
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this._hide(); });
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'ctx-menu';
    el.style.cssText = [
      'position:fixed','z-index:200','background:rgba(14,13,11,0.96)',
      'border:1px solid rgba(255,255,255,0.12)','border-radius:10px',
      'padding:6px 4px','min-width:170px','box-shadow:0 8px 24px rgba(0,0,0,0.5)',
      'backdrop-filter:blur(10px)','display:none'
    ].join(';');
    return el;
  }

  _show(x, y, items) {
    this._el.innerHTML = '';
    if (!items.length) return;
    for (const item of items) {
      const btn = document.createElement('button');
      btn.textContent = item.label;
      btn.style.cssText = [
        'display:block','width:100%','text-align:left',
        'background:none','border:none','color:#ccc',
        'padding:6px 12px','cursor:pointer','font-size:12px',
        'border-radius:6px','transition:background .12s'
      ].join(';');
      btn.onmouseenter = () => { btn.style.background = 'rgba(255,255,255,0.08)'; };
      btn.onmouseleave = () => { btn.style.background = 'none'; };
      btn.onclick = ev => { ev.stopPropagation(); item.action(); this._hide(); };
      this._el.appendChild(btn);
    }
    this._el.style.display = 'block';
    const w = this._el.offsetWidth, h = this._el.offsetHeight;
    this._el.style.left = Math.min(x, window.innerWidth  - w - 8) + 'px';
    this._el.style.top  = Math.min(y, window.innerHeight - h - 8) + 'px';
  }

  _hide() { this._el.style.display = 'none'; }

  _onRightClick(e) {
    const THREE = window._THREE;
    if (!THREE) { console.warn('[ContextMenu] THREE not ready yet'); return; }

    const rc   = new THREE.Raycaster();
    const rect = this._renderer.domElement.getBoundingClientRect();
    const mx   =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    const my   = -((e.clientY - rect.top)  / rect.height) * 2 + 1;

    const cam = this._game.camera?.camera;
    if (!cam) { console.warn('[ContextMenu] camera not ready'); return; }
    rc.setFromCamera({ x: mx, y: my }, cam);

    const selectedSim = this._game.selectedSim;
    const otherSims   = this._game.sims.filter(s => s !== selectedSim);
    const items       = [];

    // ── Hit: other Sims ─────────────────────────────
    const simHits = rc.intersectObjects(otherSims.map(s => s.mesh), true);
    if (simHits.length) {
      const hit    = simHits[0].object;
      const target = otherSims.find(s =>
        s.mesh === hit || s.mesh === hit.parent || s.mesh === hit.parent?.parent);
      if (target) {
        items.push({ label: `💬 Chat with ${target.name}`,     action: () => this._triggerSocial(selectedSim, target, 'chat') });
        items.push({ label: `😄 Tell joke to ${target.name}`, action: () => this._triggerSocial(selectedSim, target, 'joke') });
        items.push({ label: `🌟 Compliment ${target.name}`,   action: () => this._triggerSocial(selectedSim, target, 'compliment') });
        items.push({ label: `🤗 Hug ${target.name}`,          action: () => this._triggerSocial(selectedSim, target, 'hug') });
        items.push({ label: `😤 Argue with ${target.name}`,   action: () => this._triggerSocial(selectedSim, target, 'argue') });
        this._show(e.clientX, e.clientY, items);
        return;
      }
    }

    // ── Hit: ground / furniture ───────────────────────────
    const groundHits = rc.intersectObjects(this._game.world.groundMeshes);
    if (groundHits.length) {
      const p   = groundHits[0].point;
      const gx  = Math.round(p.x), gz = Math.round(p.z);
      const fur = this._game.world.furniture?.find(f => f.gx === gx && f.gz === gz);
      if (fur) {
        items.push({ label: `🛋 Use ${fur.id}`, action: () => this._triggerUse(selectedSim, fur) });
        if (fur.social) {
          for (const other of otherSims) {
            items.push({
              label:  `👥 Invite ${other.name} to ${fur.id}`,
              action: () => this._triggerSocialFurniture(selectedSim, other, fur),
            });
          }
        }
        this._show(e.clientX, e.clientY, items);
        return;
      }
    }

    // ── Hit: any Sim → select ─────────────────────────────
    const anyHits = rc.intersectObjects(this._game.sims.map(s => s.mesh), true);
    if (anyHits.length) {
      const hit = anyHits[0].object;
      const idx = this._game.sims.findIndex(s =>
        s.mesh === hit || s.mesh === hit.parent || s.mesh === hit.parent?.parent);
      if (idx >= 0) {
        items.push({ label: `🎯 Select ${this._game.sims[idx].name}`, action: () => this._game.selectSimByIndex(idx) });
        this._show(e.clientX, e.clientY, items);
      }
    }
  }

  // ── Action helpers ───────────────────────────────────────
  _ac()  { return window._actionClasses       || {}; }
  _sac() { return window._socialActionClasses || {}; }

  _triggerUse(sim, furniture) {
    const { WalkToAction, UseObjectAction } = this._ac();
    if (!WalkToAction) return;
    sim.brain.override([
      new WalkToAction(sim, this._game.world, furniture.gx, furniture.gz + 1),
      new UseObjectAction(sim, furniture, 6),
    ]);
    bus.emit('player:useFurniture', { sim, furniture });
  }

  _triggerSocial(simA, simB, type) {
    const { SocialAction } = this._sac();
    if (!SocialAction) return;
    simA.brain.override([new SocialAction(simA, simB, this._game.world, type)]);
    bus.emit('player:socialAction', { simA, simB, type });
  }

  _triggerSocialFurniture(simA, simB, furniture) {
    const { WalkToAction, UseObjectAction } = this._ac();
    const { SocialAction }                  = this._sac();
    if (!WalkToAction || !SocialAction) return;
    simA.brain.override([
      new WalkToAction(simA, this._game.world, furniture.gx, furniture.gz + 1),
      new UseObjectAction(simA, furniture, 4),
      new SocialAction(simA, simB, this._game.world),
    ]);
    simB.brain.override([
      new WalkToAction(simB, this._game.world, furniture.gx, furniture.gz - 1),
      new UseObjectAction(simB, furniture, 4),
    ]);
  }
}

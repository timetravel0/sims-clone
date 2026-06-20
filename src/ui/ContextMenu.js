import { bus } from '../core/EventBus.js';

/**
 * ContextMenu — right-click on a Sim or furniture tile shows a radial
 * menu of available actions the PLAYER can trigger manually.
 *
 * Emits:
 *   'player:useFurniture'  { sim, furniture }
 *   'player:socialAction'  { simA, simB, type }
 */
export class ContextMenu {
  constructor(game, renderer) {
    this._game     = game;
    this._renderer = renderer;
    this._el       = this._build();
    document.body.appendChild(this._el);
    this._hide();

    renderer.domElement.addEventListener('contextmenu', e => {
      e.preventDefault();
      this._onRightClick(e);
    });
    document.addEventListener('click', () => this._hide());
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
    if (items.length === 0) return;
    for (const item of items) {
      const btn = document.createElement('button');
      btn.textContent = item.label;
      btn.style.cssText = [
        'display:block','width:100%','text-align:left',
        'background:none','border:none','color:#ccc',
        'padding:6px 12px','cursor:pointer','font-size:12px',
        'border-radius:6px','transition:background .12s'
      ].join(';');
      btn.onmouseenter = () => btn.style.background = 'rgba(255,255,255,0.08)';
      btn.onmouseleave = () => btn.style.background = 'none';
      btn.onclick = (e) => { e.stopPropagation(); item.action(); this._hide(); };
      this._el.appendChild(btn);
    }
    // Separator style for groups
    this._el.style.display = 'block';
    const rect = this._el.getBoundingClientRect();
    const clampX = Math.min(x, window.innerWidth  - rect.width  - 8);
    const clampY = Math.min(y, window.innerHeight - rect.height - 8);
    this._el.style.left = clampX + 'px';
    this._el.style.top  = clampY + 'px';
  }

  _hide() { this._el.style.display = 'none'; }

  _onRightClick(e) {
    const raycaster = new (window.THREE || {}).Raycaster?.() ||
      this._game._raycaster;
    const mouse = { x: 0, y: 0 };
    const rect  = this._renderer.domElement.getBoundingClientRect();
    mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;

    const cam = this._game._camera?.camera;
    if (!cam) return;
    raycaster.setFromCamera(mouse, cam);

    const selectedSim = this._game.selectedSim;
    const items = [];

    // --- Hit test: other Sims ---
    const otherSims = this._game.sims.filter(s => s !== selectedSim);
    const simHits   = raycaster.intersectObjects(
      otherSims.map(s => s.mesh), true
    );
    if (simHits.length > 0) {
      const hitMesh = simHits[0].object;
      const target  = otherSims.find(s =>
        s.mesh === hitMesh ||
        s.mesh === hitMesh.parent ||
        s.mesh === hitMesh.parent?.parent
      );
      if (target) {
        items.push({ label: `💬 Chat with ${target.name}`,       action: () => this._triggerSocial(selectedSim, target, 'chat') });
        items.push({ label: `😄 Tell joke to ${target.name}`,   action: () => this._triggerSocial(selectedSim, target, 'joke') });
        items.push({ label: `🌟 Compliment ${target.name}`,      action: () => this._triggerSocial(selectedSim, target, 'compliment') });
        items.push({ label: `🤗 Hug ${target.name}`,             action: () => this._triggerSocial(selectedSim, target, 'hug') });
        items.push({ label: `😠 Argue with ${target.name}`,      action: () => this._triggerSocial(selectedSim, target, 'argue') });
        this._show(e.clientX, e.clientY, items);
        return;
      }
    }

    // --- Hit test: furniture tiles ---
    const groundHits = raycaster.intersectObjects(this._game.world.groundMeshes);
    if (groundHits.length > 0) {
      const p  = groundHits[0].point;
      const gx = Math.round(p.x), gz = Math.round(p.z);
      const furniture = this._game.world.furniture.find(
        f => f.gx === gx && f.gz === gz
      );
      if (furniture) {
        items.push({ label: `🛋 Use ${furniture.id}`, action: () => this._triggerUse(selectedSim, furniture) });
        // Social furniture: invite another Sim
        if (furniture.social) {
          for (const other of otherSims) {
            items.push({
              label: `👥 Invite ${other.name} to ${furniture.id}`,
              action: () => this._triggerSocialFurniture(selectedSim, other, furniture)
            });
          }
        }
        this._show(e.clientX, e.clientY, items);
        return;
      }
    }

    // --- Fallback: select Sim under cursor ---
    const allSimHits = raycaster.intersectObjects(this._game.sims.map(s => s.mesh), true);
    if (allSimHits.length > 0) {
      const hit = allSimHits[0].object;
      const idx = this._game.sims.findIndex(s =>
        s.mesh === hit || s.mesh === hit.parent || s.mesh === hit.parent?.parent);
      if (idx >= 0) {
        items.push({ label: `🎯 Select ${this._game.sims[idx].name}`, action: () => this._game.selectSimByIndex(idx) });
        this._show(e.clientX, e.clientY, items);
      }
    }
  }

  _triggerUse(sim, furniture) {
    const { WalkToAction, UseObjectAction } = this._actions();
    sim.brain.override([
      new WalkToAction(sim, this._game.world, furniture.gx, furniture.gz + 1),
      new UseObjectAction(sim, furniture, 6),
    ]);
    bus.emit('player:useFurniture', { sim, furniture });
  }

  _triggerSocial(simA, simB, type) {
    const { SocialAction } = this._socialActions();
    simA.brain.override([new SocialAction(simA, simB, this._game.world, type)]);
    bus.emit('player:socialAction', { simA, simB, type });
  }

  _triggerSocialFurniture(simA, simB, furniture) {
    const { WalkToAction, UseObjectAction } = this._actions();
    const { SocialAction } = this._socialActions();
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

  // Lazy imports to avoid circular deps
  _actions() {
    return window._actionClasses || {};
  }
  _socialActions() {
    return window._socialActionClasses || {};
  }
}

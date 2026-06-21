/**
 * SaveSlotPanel — Sprint 6
 * Modal panel for Save / Load / Delete across 3 slots.
 *
 * Slot 0 is reserved for auto-save (label shows "Auto-Save").
 * Slots 1-2 are manual save slots.
 *
 * DOM anchor: <div id="save-slot-panel">
 * Keyboard: Escape closes.
 *
 * Reacts to:
 *   save:completed  → refreshes slot list, shows tick animation
 *   load:completed  → closes panel
 *   save:deleted    → refreshes slot list
 */
import { bus } from '../core/EventBus.js';

export class SaveSlotPanel {
  /**
   * @param {SaveLoad} saveLoad
   * @param {GameClock} gameClock
   */
  constructor(saveLoad, gameClock) {
    this._sl    = saveLoad;
    this._clock = gameClock;
    this._el    = document.getElementById('save-slot-panel');
    this._mode  = 'save';   // 'save' | 'load'

    bus.on('save:completed', () => this._render());
    bus.on('save:deleted',   () => this._render());
    bus.on('load:completed', () => this.close());

    document.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); });
    this._render();
  }

  open(mode = 'save') {
    this._mode = mode;
    if (this._el) this._el.style.display = 'flex';
    this._render();
  }
  close() { if (this._el) this._el.style.display = 'none'; }
  isOpen()  { return this._el?.style.display === 'flex'; }

  _render() {
    if (!this._el) return;
    const slots = this._sl.slotList();
    const isSave = this._mode === 'save';

    const slotCards = slots.map(s => {
      const isAuto = s.slot === 0;
      const label  = isAuto ? '🔄 Auto-Save' : `Slot ${s.slot}`;
      const info   = s.empty
        ? '<span style="color:#5a5957">Empty</span>'
        : `<span>${s.householdName}</span><span style="color:#7a7974"> &mdash; Day ${s.day ?? 1} &bull; ${s.simCount} Sim${s.simCount !== 1 ? 's' : ''} &bull; ${this._formatDate(s.timestamp)}</span>`;

      const canSave   = isSave && (!isAuto);  // don't manually save over auto-slot
      const canLoad   = !s.empty;
      const canDelete = !s.empty && (!isAuto || !isSave);

      return `
        <div class="ss-card" data-slot="${s.slot}">
          <div class="ss-label">${label}</div>
          <div class="ss-info">${info}</div>
          <div class="ss-actions">
            ${ canSave   ? `<button class="ss-btn ss-save"   data-slot="${s.slot}">&#128190; Save</button>` : '' }
            ${ canLoad   ? `<button class="ss-btn ss-load"   data-slot="${s.slot}">&#9654; Load</button>` : '' }
            ${ canDelete ? `<button class="ss-btn ss-delete" data-slot="${s.slot}">&#128465;</button>` : '' }
          </div>
        </div>`;
    }).join('');

    this._el.innerHTML = `
      <div class="ss-modal">
        <div class="ss-header">
          <span>${isSave ? '💾 Save Game' : '📂 Load Game'}</span>
          <div style="display:flex;gap:8px">
            <button class="ss-tab${isSave?' active':''}" data-mode="save">Save</button>
            <button class="ss-tab${!isSave?' active':''}" data-mode="load">Load</button>
            <button id="ss-close">✕</button>
          </div>
        </div>
        <div class="ss-body">${slotCards}</div>
        <div class="ss-footer" style="color:#5a5957;font-size:11px;padding:8px 16px">Auto-Save runs every 5 minutes to Slot 0.</div>
      </div>`;

    // Bind
    document.getElementById('ss-close')?.addEventListener('click', () => this.close());
    this._el.querySelectorAll('.ss-tab').forEach(t =>
      t.addEventListener('click', () => { this._mode = t.dataset.mode; this._render(); }));
    this._el.querySelectorAll('.ss-save').forEach(b =>
      b.addEventListener('click', () => this._sl.save(+b.dataset.slot)));
    this._el.querySelectorAll('.ss-load').forEach(b =>
      b.addEventListener('click', () => { if (confirm('Load this save? Unsaved progress will be lost.')) this._sl.load(+b.dataset.slot); }));
    this._el.querySelectorAll('.ss-delete').forEach(b =>
      b.addEventListener('click', () => { if (confirm('Delete this save?')) this._sl.deleteSlot(+b.dataset.slot); }));
  }

  _formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

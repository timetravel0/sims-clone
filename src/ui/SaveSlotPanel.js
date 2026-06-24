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
    this._renderSeq = 0;

    bus.on('save:completed', () => void this._render());
    bus.on('save:deleted',   () => void this._render());
    bus.on('save:failed',    () => void this._render());
    bus.on('load:completed', () => this.close());

    document.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); });
    void this._render();
  }

  open(mode = 'save') {
    this._mode = mode;
    if (this._el) this._el.style.display = 'flex';
    void this._render();
  }
  close() { if (this._el) this._el.style.display = 'none'; }
  isOpen()  { return this._el?.style.display === 'flex'; }

  async _render() {
    if (!this._el) return;
    const seq = ++this._renderSeq;
    const isSave = this._mode === 'save';
    this._renderLoading(isSave);

    let slots = [];
    try {
      slots = await this._sl.slotList();
    } catch (err) {
      if (seq !== this._renderSeq) return;
      this._renderError(isSave, err);
      return;
    }
    if (seq !== this._renderSeq) return;

    const slotCards = slots.map(s => {
      const isAuto = s.slot === 0;
      const label  = isAuto ? '🔄 Auto-Save' : `Save ${s.slot}`;
      const info   = s.empty
        ? '<span style="color:#5a5957">Empty</span>'
        : `<span>${s.householdName}</span><span style="color:#7a7974"> &mdash; Day ${s.day ?? 1} &bull; ${s.simCount} Sim${s.simCount !== 1 ? 's' : ''} &bull; ${this._formatDate(s.timestamp)}</span>`;

      const canSave   = isSave && !isAuto;
      const canLoad   = !s.empty;
      const canDelete = !s.empty && !isAuto;

      return `
        <div class="ss-card" data-slot="${s.slot}">
          <div class="ss-label">${label}</div>
          <div class="ss-info">${info}</div>
          <div class="ss-actions">
            ${ canSave   ? `<button class="ss-btn ss-save"   data-slot="${s.slot}">&#128190; ${s.empty ? 'Save' : 'Overwrite'}</button>` : '' }
            ${ canLoad   ? `<button class="ss-btn ss-load"   data-slot="${s.slot}">&#9654; Load</button>` : '' }
            ${ canDelete ? `<button class="ss-btn ss-delete" data-slot="${s.slot}">&#128465;</button>` : '' }
          </div>
        </div>`;
    }).join('');
    const newSaveBtn = isSave
      ? `<button id="ss-new-save" class="ss-btn" style="width:100%;margin-bottom:8px;background:#2a4a2a;color:#8fbc8f">+ New Save</button>`
      : '';
    const storage = await this._storageHTML();

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
        <div class="ss-body">${storage}${newSaveBtn}${slotCards}</div>
        <div class="ss-footer" style="color:#5a5957;font-size:11px;padding:8px 16px">Auto-Save runs every 5 minutes to Slot 0.</div>
      </div>`;

    this._bindActions();
  }

  _renderLoading(isSave) {
    this._el.innerHTML = `
      <div class="ss-modal">
        <div class="ss-header">
          <span>${isSave ? '💾 Save Game' : '📂 Load Game'}</span>
          <button id="ss-close">✕</button>
        </div>
        <div class="ss-body" style="padding:16px;color:#7a7974">Loading slots…</div>
      </div>`;
    document.getElementById('ss-close')?.addEventListener('click', () => this.close());
  }

  _renderError(isSave, err) {
    this._el.innerHTML = `
      <div class="ss-modal">
        <div class="ss-header">
          <span>${isSave ? '💾 Save Game' : '📂 Load Game'}</span>
          <button id="ss-close">✕</button>
        </div>
        <div class="ss-body" style="padding:16px;color:#c44">Could not read save slots: ${this._escape(err?.message ?? err)}</div>
      </div>`;
    document.getElementById('ss-close')?.addEventListener('click', () => this.close());
  }

  _bindActions() {
    document.getElementById('ss-close')?.addEventListener('click', () => this.close());
    this._el.querySelectorAll('.ss-tab').forEach(t =>
      t.addEventListener('click', () => { this._mode = t.dataset.mode; void this._render(); }));
    this._el.querySelectorAll('.ss-save').forEach(b =>
      b.addEventListener('click', async () => { await this._sl.save(+b.dataset.slot); await this._render(); }));
    this._el.querySelectorAll('.ss-load').forEach(b =>
      b.addEventListener('click', async () => { if (confirm('Load this save? Unsaved progress will be lost.')) await this._sl.load(+b.dataset.slot); }));
    this._el.querySelectorAll('.ss-delete').forEach(b =>
      b.addEventListener('click', async () => { if (confirm('Delete this save?')) await this._sl.deleteSlot(+b.dataset.slot); }));
    document.getElementById('ss-new-save')?.addEventListener('click', async () => {
      const slot = await this._sl.nextSlot();
      await this._sl.save(slot);
      await this._render();
    });
    this._el.querySelector('#ss-db-open')?.addEventListener('click', async () => {
      const adapter = this._sl.adapter;
      if (!confirm('Use an existing SQLite file? Current in-memory slots will be replaced by that file.')) return;
      await adapter.chooseFilesystemFile();
      await this._render();
    });
    this._el.querySelector('#ss-db-saveas')?.addEventListener('click', async () => {
      const adapter = this._sl.adapter;
      await adapter.saveAsFilesystemFile();
      await this._render();
    });
  }

  async _storageHTML() {
    const adapter = this._sl.adapter;
    const info = await this._sl.backendInfo?.().catch(() => null);
    const backend = info?.backend ?? adapter?.constructor?.name ?? 'unknown';
    const storage = info?.storage ?? (info?.sqlite ? 'SQLite' : 'localStorage');
    const visible = info?.visibleInProjectFolder ? 'visible filesystem file' : 'browser-private storage';
    const fileName = info?.fileName ? ` · ${this._escape(info.fileName)}` : '';
    const canFile = typeof adapter?.canUseFilesystemFile === 'function' && adapter.canUseFilesystemFile();
    const buttons = canFile ? `
      <button id="ss-db-open" title="Open an existing .sqlite/.db file and use it as the live database">Use .sqlite file</button>
      <button id="ss-db-saveas" title="Create/export a visible .sqlite file and keep writing to it">Export/Switch to file</button>
    ` : '';
    return `
      <div class="ss-storage">
        <div>
          <b>Database:</b> ${this._escape(backend)} · ${this._escape(storage)} · ${visible}${fileName}
        </div>
        <div class="ss-actions">${buttons}</div>
      </div>`;
  }

  _formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  _escape(text) {
    return String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
}

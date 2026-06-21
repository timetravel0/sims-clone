/**
 * CataloguePanel — Sprint 5
 * Full-screen overlay panel for buying furniture and building elements.
 *
 * Tabs:
 *   Furniture  — grid of cards from ObjectRegistry, each with name, icon, cost §
 *   Walls      — activates wall tool in BuildModeWalls
 *   Doors      — activates door tool in BuildModeWalls
 *   Eraser     — activates eraser tool
 *
 * On furniture card click:
 *   1. Checks budget (BudgetSystem.debit)
 *   2. Passes item to BuildMode.selectCatalogItem
 *   3. Activates BuildMode
 *   4. Closes panel
 *
 * Reacts to:
 *   budget:changed       → refreshes funds display
 *   budget:insufficient  → flashes cost red
 *
 * DOM anchor: <div id="catalogue-panel">
 */
import { bus }          from '../core/EventBus.js';
import { budgetSystem } from '../systems/BudgetSystem.js';
import { ObjectRegistry } from '../systems/ObjectRegistry.js';

const TAB_IDS = ['furniture', 'walls', 'doors', 'eraser'];

const WALL_ITEM  = { id: 'wall',  label: 'Wall Segment',  cost: 250, icon: '🧱' };
const DOOR_ITEM  = { id: 'door',  label: 'Door',          cost: 500, icon: '🚪' };
const ERASER_ITEM= { id: 'eraser',label: 'Eraser',        cost: 0,   icon: '🧹' };

export class CataloguePanel {
  /**
   * @param {object} game              Game instance
   * @param {BuildModeWalls} buildWalls
   */
  constructor(game, buildWalls) {
    this._game  = game;
    this._bw    = buildWalls;
    this._el    = document.getElementById('catalogue-panel');
    this._tab   = 'furniture';
    this._flash = new Set(); // item ids flashing red

    bus.on('budget:changed',      () => this._updateFundsBar());
    bus.on('budget:insufficient', ({ item }) => {
      if (item?.id) {
        this._flash.add(item.id);
        setTimeout(() => { this._flash.delete(item.id); this._render(); }, 800);
        this._render();
      }
    });

    this._render();
  }

  open()  { if (this._el) this._el.style.display = 'flex'; this._render(); }
  close() { if (this._el) this._el.style.display = 'none'; }
  isOpen(){ return this._el?.style.display === 'flex'; }
  toggle(){ this.isOpen() ? this.close() : this.open(); }

  _render() {
    if (!this._el) return;
    const funds    = budgetSystem.funds;
    const items    = ObjectRegistry.all ? ObjectRegistry.all() : [];

    const tabBar = TAB_IDS.map(t => `
      <button class="cat-tab${this._tab === t ? ' active' : ''}" data-tab="${t}">
        ${{ furniture:'🛋 Furniture', walls:'🧱 Walls', doors:'🚪 Doors', eraser:'🧹 Eraser' }[t]}
      </button>`).join('');

    let content = '';
    if (this._tab === 'furniture') {
      content = `<div class="cat-grid">${items.map(item => {
        const affordable = funds >= (item.cost ?? 0);
        const flashing   = this._flash.has(item.id);
        return `
          <div class="cat-card${affordable ? '' : ' unaffordable'}${flashing ? ' flash-red' : ''}" data-id="${item.id}">
            <div class="cat-icon">${item.icon ?? '📦'}</div>
            <div class="cat-name">${item.label ?? item.id}</div>
            <div class="cat-cost ${affordable ? '' : 'cant-afford'}">§${(item.cost ?? 0).toLocaleString()}</div>
          </div>`;
      }).join('')}</div>`;
    } else if (this._tab === 'walls') {
      content = this._toolCard(WALL_ITEM, funds);
    } else if (this._tab === 'doors') {
      content = this._toolCard(DOOR_ITEM, funds);
    } else {
      content = this._toolCard(ERASER_ITEM, funds);
    }

    this._el.innerHTML = `
      <div class="cat-header">
        <span>🏠 Build Catalogue</span>
        <span class="cat-funds">§${funds.toLocaleString()}</span>
        <button id="cat-close">✕</button>
      </div>
      <div class="cat-tabs">${tabBar}</div>
      <div class="cat-body">${content}</div>`;

    // Bind events
    document.getElementById('cat-close')?.addEventListener('click', () => this.close());
    this._el.querySelectorAll('.cat-tab').forEach(btn => {
      btn.addEventListener('click', () => { this._tab = btn.dataset.tab; this._render(); });
    });
    this._el.querySelectorAll('.cat-card').forEach(card => {
      card.addEventListener('click', () => this._onCardClick(card.dataset.id));
    });
  }

  _toolCard(item, funds) {
    const affordable = funds >= item.cost;
    return `
      <div class="cat-tool-card${affordable ? '' : ' unaffordable'}" data-id="${item.id}">
        <div class="cat-icon large">${item.icon}</div>
        <div class="cat-name">${item.label}</div>
        <div class="cat-cost ${affordable ? '' : 'cant-afford'}">${item.cost > 0 ? '§' + item.cost + '/segment' : 'Free'}</div>
        <button class="btn-activate">Activate Tool</button>
      </div>`;
  }

  _updateFundsBar() {
    const el = this._el?.querySelector('.cat-funds');
    if (el) el.textContent = `§${budgetSystem.funds.toLocaleString()}`;
    // Refresh affordability classes without full re-render
    this._el?.querySelectorAll('.cat-card').forEach(card => {
      const item = ObjectRegistry.get?.(card.dataset.id);
      if (!item) return;
      const ok = budgetSystem.funds >= (item.cost ?? 0);
      card.classList.toggle('unaffordable', !ok);
      card.querySelector('.cat-cost')?.classList.toggle('cant-afford', !ok);
    });
  }

  _onCardClick(id) {
    if (this._tab === 'furniture') {
      const item = ObjectRegistry.get?.(id);
      if (!item) return;
      if (!budgetSystem.debit(item.cost ?? 0, 'furniture', item)) return;
      this._game.buildMode?.setActive(true);
      this._game.buildMode?.selectCatalogItem(item);
      this._bw?.setTool('furniture');
      this.close();
    } else if (this._tab === 'walls') {
      this._game.buildMode?.setActive(true);
      this._bw?.setTool('wall');
      this.close();
    } else if (this._tab === 'doors') {
      this._game.buildMode?.setActive(true);
      this._bw?.setTool('door');
      this.close();
    } else {
      this._game.buildMode?.setActive(true);
      this._bw?.setTool('eraser');
      this.close();
    }
  }
}

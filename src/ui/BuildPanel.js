import { FURNITURE_CATALOG } from '../world/BuildMode.js';
import { bus } from '../core/EventBus.js';

export class BuildPanel {
  constructor() {
    this._el  = document.getElementById('build-panel');
    this._btn = document.getElementById('btn-build');
    if (!this._el) return;
    this._list = this._el.querySelector('#build-catalog');
    this._populate();

    this._btn?.addEventListener('click', () => {
      const bm = window._game?.buildMode;
      if (!bm) return;
      bm.setActive(!bm.active);
    });

    bus.on('buildMode:changed', ({ active }) => {
      this._el.style.display = active ? 'block' : 'none';
      this._btn?.classList.toggle('active', active);
    });

    bus.on('registry:updated', () => this._populate());
  }

  _populate() {
    if (!this._list) return;
    this._list.innerHTML = '';
    for (const item of FURNITURE_CATALOG()) {
      const btn = document.createElement('button');
      btn.className = 'catalog-item';
      const hex = `#${item.color.toString(16).padStart(6, '0')}`;
      const socialBadge = item.social ? '<span class="ci-social">✦</span>' : '';
      btn.innerHTML =
        `<span class="ci-swatch" style="background:${hex}"></span>${item.label}${socialBadge}`;
      btn.addEventListener('click', () => {
        window._game?.buildMode.selectCatalogItem(item);
        this._list.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
      this._list.appendChild(btn);
    }
  }
}

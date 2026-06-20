import { NEED_KEYS } from '../entities/SimNeeds.js';

const COLORS = {
  hunger:  '#ef9a9a',
  energy:  '#fff59d',
  bladder: '#80deea',
  hygiene: '#a5d6a7',
  social:  '#ce93d8',
  fun:     '#ffcc80',
  comfort: '#f48fb1',
  room:    '#90caf9',
};

export class NeedsPanel {
  constructor(simName) {
    document.getElementById('sim-name').textContent = simName;
    const container = document.getElementById('needs-bars');
    this._bars = {};

    for (const key of NEED_KEYS) {
      const row = document.createElement('div');
      row.className = 'need-row';
      row.innerHTML = `
        <span class="need-label">${key}</span>
        <div class="need-bar-bg">
          <div class="need-bar-fill" id="bar-${key}" style="width:80%;background:${COLORS[key]}"></div>
        </div>
      `;
      container.appendChild(row);
      this._bars[key] = document.getElementById(`bar-${key}`);
    }
  }

  update(values) {
    for (const key of NEED_KEYS) {
      const bar = this._bars[key];
      if (!bar) continue;
      const pct = Math.max(0, Math.min(100, values[key]));
      bar.style.width = `${pct}%`;
      bar.style.background = pct < 25 ? '#ef5350' : pct < 50 ? '#ffa726' : COLORS[key];
    }
  }
}

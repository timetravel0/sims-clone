export class ClockDisplay {
  constructor() {
    this._el = document.getElementById('clock');
  }
  update(hour) {
    if (!this._el) return;
    const h = hour % 24;
    const suffix = h < 12 ? 'AM' : 'PM';
    const display = ((h % 12) || 12);
    this._el.textContent = `${display}:00 ${suffix}`;
    // Color the clock label by time of day
    const isNight = h < 6 || h > 20;
    this._el.style.color = isNight ? '#8888cc' : '#ffd580';
  }
}

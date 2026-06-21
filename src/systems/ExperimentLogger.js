import { bus } from '../core/EventBus.js';

const EVENTS = [
  'social:interaction',
  'social:update',
  'mood:change',
  'emotion:triggered',
  'life:event',
  'god:action',
  'relationship:graphChanged',
  'need:crisis',
  'sim:action',
];

export class ExperimentLogger {
  constructor(game = null) {
    this._game = game;
    this._tick = 0;
    this._events = [];
    this._unsubscribers = EVENTS.map(type =>
      bus.on(type, payload => this.record(type, payload))
    );
  }

  update(dt) {
    this._tick += 1;
    this._lastDt = dt;
  }

  record(type, payload = {}) {
    this._events.push({
      tick: this._tick,
      simHour: Number(this._game?.clock?.hour ?? 0).toFixed(2),
      type,
      ...this._sanitize(payload),
    });
    if (this._events.length > 20000) this._events.shift();
  }

  clear() {
    this._events = [];
  }

  dispose() {
    for (const off of this._unsubscribers) off();
    this._unsubscribers = [];
  }

  serialise() {
    return {
      tick: this._tick,
      events: this._events,
    };
  }

  restore(data = {}) {
    this._tick = data.tick ?? 0;
    this._events = Array.isArray(data.events) ? data.events.slice(-20000) : [];
  }

  toJSON() {
    return JSON.stringify(this._events, null, 2);
  }

  toCSV() {
    if (this._events.length === 0) return 'tick,simHour,type\n';
    const keys = Array.from(this._events.reduce((set, row) => {
      Object.keys(row).forEach(key => set.add(key));
      return set;
    }, new Set(['tick', 'simHour', 'type'])));
    return [
      keys.join(','),
      ...this._events.map(row => keys.map(key => this._csv(row[key])).join(',')),
    ].join('\n');
  }

  downloadJSON(filename = 'experiment-log.json') {
    this._download(filename, this.toJSON(), 'application/json');
  }

  downloadCSV(filename = 'experiment-log.csv') {
    this._download(filename, this.toCSV(), 'text/csv');
  }

  get events() {
    return this._events;
  }

  _sanitize(payload) {
    const out = {};
    for (const [key, value] of Object.entries(payload || {})) {
      if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) {
        out[key] = value;
      } else if (Array.isArray(value)) {
        out[key] = value.map(v => this._simple(v)).join('|');
      } else {
        out[key] = this._simple(value);
      }
    }
    return out;
  }

  _simple(value) {
    if (value == null) return '';
    if (['string', 'number', 'boolean'].includes(typeof value)) return value;
    return value.id || value.name || JSON.stringify(value);
  }

  _csv(value) {
    const text = value == null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  _download(filename, content, mime) {
    if (typeof document === 'undefined') return;
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

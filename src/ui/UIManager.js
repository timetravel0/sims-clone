import { NeedsPanel } from './NeedsPanel.js';
import { bus } from '../core/EventBus.js';

export class UIManager {
  constructor(sim, _bus) {
    this._sim = sim;
    this._needsPanel = new NeedsPanel(sim.name);

    bus.on('simNeeds:update', ({ values }) => {
      this._needsPanel.update(values);
    });
  }
}

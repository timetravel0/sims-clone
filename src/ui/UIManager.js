import { NeedsPanel }    from './NeedsPanel.js';
import { SimSelector }  from './SimSelector.js';
import { ClockDisplay } from './ClockDisplay.js';
import { BuildPanel }   from './BuildPanel.js';
import { bus }          from '../core/EventBus.js';

export class UIManager {
  constructor(sims, selectedSim, _bus) {
    this._sims = sims;
    this._panel   = new NeedsPanel(selectedSim.name);
    this._selector = new SimSelector(sims);
    this._clock   = new ClockDisplay();
    this._build   = new BuildPanel();

    bus.on('sim:selected', ({ sim }) => this._panel.setSimName(sim.name));
    bus.on('simNeeds:update', ({ simId, values }) => {
      const sel = window._game?.selectedSim;
      if (sel && sel.id === simId) this._panel.update(values);
    });
    bus.on('daynight:update', ({ hour }) => this._clock.update(hour));
  }
}

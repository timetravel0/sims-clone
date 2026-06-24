import { bus } from '../core/EventBus.js';
import { TREATMENTS, TREATMENT_BY_ID, pickTreatment } from '../config/treatments.js';

export { TREATMENTS };

/**
 * DoctorService — paid medical treatment (WP7 / Milestone 11).
 *
 * Illness becomes actionable: a doctor resolves health problems for a fee.
 *  - Manual (player): `book(personId, treatmentId)` from the UI.
 *  - Autonomous: when a household Sim falls ill above a severity threshold and
 *    can afford care, they book it themselves.
 *
 * A booking models a home doctor visit / clinic trip as a short delay; on
 * arrival the fee is debited and the illness is treated. Budget is always
 * checked, and every booking/treatment is logged (story + events) so headless
 * can report medical activity.
 */
const AUTO_SEVERITY  = 0.45;  // autonomous care kicks in at/above this severity
const ARRIVAL_TICKS  = 30;    // delay between booking and the doctor arriving

export class DoctorService {
  constructor(game) {
    this._game = game;
    this._pending = new Map(); // personId → { treatmentId, dueTick, auto }
    this._off = bus.on('health:stateChanged', e => this._onState(e));
  }

  _onState({ personId, state, severity, illness }) {
    if (state !== 'ill') return;
    if (!this._game.population?.isHouseholdMember?.(personId)) return;
    if ((severity ?? 0) < AUTO_SEVERITY) return;
    this.book(personId, null, { auto: true, illness, severity });
  }

  /**
   * Book a treatment. `treatmentId` null = auto-pick by illness/severity/funds.
   * Returns the chosen treatment id, or null if none could be booked.
   */
  book(personId, treatmentId = null, { auto = false, illness, severity } = {}) {
    const person = this._game.population?.getPerson?.(personId);
    if (!person || person.dead) return null;
    if ((person.health?.state ?? 'healthy') === 'healthy') return null;
    if (this._pending.has(personId)) return null;

    const funds = this._game.budgetSystem?.funds ?? 0;
    const ill = illness ?? person.health?.illness ?? '';
    const sev = severity ?? person.health?.severity ?? 0;
    const treatment = treatmentId
      ? TREATMENT_BY_ID.get(treatmentId)
      : pickTreatment(ill, sev, funds);
    if (!treatment) return null;                 // nothing affordable/appropriate
    if (funds < treatment.cost) return null;

    this._pending.set(personId, { treatmentId: treatment.id, dueTick: (this._game.tick ?? 0) + ARRIVAL_TICKS, auto });
    bus.emit('health:treatmentBooked', { personId, personName: person.name, treatmentId: treatment.id, cost: treatment.cost, auto });
    bus.emit('story:entry', {
      simId: personId,
      text: `${person.name} ha prenotato una visita medica (${treatment.label}).`,
      cat: 'family', category: 'family',
    });
    return treatment.id;
  }

  /** Immediate treatment (no delay) — used by tests/console. */
  treatNow(personId, treatmentId = null) {
    const ok = this.book(personId, treatmentId);
    if (ok) this._resolve(personId);
    return ok;
  }

  update() {
    const tick = this._game.tick ?? 0;
    for (const [personId, p] of [...this._pending]) {
      if (tick >= p.dueTick) this._resolve(personId);
    }
  }

  _resolve(personId) {
    const p = this._pending.get(personId);
    if (!p) return;
    this._pending.delete(personId);
    const person = this._game.population?.getPerson?.(personId);
    const treatment = TREATMENT_BY_ID.get(p.treatmentId);
    if (!person || !treatment) return;
    if (!this._game.budgetSystem?.debit?.(treatment.cost, 'medical', { personId, treatmentId: treatment.id })) {
      bus.emit('story:entry', { simId: personId, text: `${person.name} non può pagare le cure mediche.`, cat: 'drama', category: 'drama' });
      return;
    }
    const resolved = this._game.healthSystem?.treat?.(personId, { resolve: treatment.resolves, drop: treatment.drop ?? 0.4 });
    bus.emit('health:treated', {
      personId, personName: person.name,
      treatmentId: treatment.id, cost: treatment.cost,
      resolved: !!treatment.resolves && !!resolved, auto: p.auto,
    });
    bus.emit('story:entry', {
      simId: personId,
      text: `${person.name} è stato curato (${treatment.label}, −§${treatment.cost})${treatment.resolves ? ' ed è guarito.' : '.'}`,
      cat: 'positive', category: 'positive',
    });
  }

  dispose() { this._off?.(); this._pending.clear(); }
}

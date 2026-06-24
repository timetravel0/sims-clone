/**
 * BudgetSystem — Sprint 5
 * Manages household § (Simoleons) budget.
 * - Each household starts with §20,000.
 * - Furniture purchases deduct cost.
 * - Career salary payments (from CareerSystem) add income.
 * - Emits: budget:changed { prev, next, delta, reason }
 * - Emits: budget:insufficient { needed, available, item }
 * Serialisable.
 */
import { bus } from '../core/EventBus.js';

const STARTING_FUNDS = 20_000;

export class BudgetSystem {
  constructor() {
    this._funds = STARTING_FUNDS;
    // Listen for career salary events
    bus.on('career:salary', ({ amount }) => this.credit(amount, 'salary'));
  }

  get funds() { return this._funds; }

  /** Reset to the starting balance (used to isolate headless runs). */
  reset() { this._funds = STARTING_FUNDS; }

  /** Set the balance directly (used by the household creator's starting budget). */
  setFunds(amount) {
    const n = Math.max(0, Math.min(9_999_999, Math.floor(Number(amount) || 0)));
    const prev = this._funds;
    this._funds = n;
    bus.emit('budget:changed', { prev, next: n, delta: n - prev, reason: 'set' });
  }

  /**
   * Attempt to debit § for a purchase.
   * @returns {boolean} true if successful
   */
  debit(amount, reason = 'purchase', item = null) {
    if (amount > this._funds) {
      bus.emit('budget:insufficient', { needed: amount, available: this._funds, item });
      return false;
    }
    const prev = this._funds;
    this._funds -= amount;
    bus.emit('budget:changed', { prev, next: this._funds, delta: -amount, reason });
    return true;
  }

  /** Add funds (salary, cheat, sell) */
  credit(amount, reason = 'income') {
    const prev = this._funds;
    this._funds = Math.min(9_999_999, this._funds + amount);
    bus.emit('budget:changed', { prev, next: this._funds, delta: amount, reason });
  }

  /** Refund a partial amount (sell at 50%) */
  sellRefund(originalCost) {
    this.credit(Math.floor(originalCost * 0.5), 'sell');
  }

  serialise()        { return { funds: this._funds }; }
  restore(data)      { if (data?.funds != null) this._funds = data.funds; }
}

export const budgetSystem = new BudgetSystem();

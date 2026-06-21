/**
 * LifecycleNotifier
 * -----------------
 * Subscribes to lifecycle-related EventBus events and renders
 * non-intrusive toast notifications in #lifecycle-toast.
 *
 * Handled events:
 *   lifecycle:stageChanged  { sim, oldStage, newStage, age }
 *   career:promoted         { sim, career, oldLevel, newLevel, salary }
 *   career:fired            { sim, career }
 *   career:skillGain        { sim, skill, value }
 *   schedule:slotChanged    { sim, slot }   (slot = { type, label })
 *
 * Each toast is queued and displayed one at a time with a
 * configurable display duration and CSS slide-in / fade-out.
 */

import { bus } from '../core/EventBus.js';

// ── config ────────────────────────────────────────────────────────
const DISPLAY_MS   = 3400;   // visible time per toast
const ANIMATE_OUT  = 400;    // matches CSS toastLcOut duration
const MAX_QUEUE    = 12;     // discard oldest if queue overflows

// category → CSS modifier class
const CAT_CLASS = {
  stage    : 'lc-stage',
  promote  : 'lc-promote',
  fire     : 'lc-fire',
  skill    : 'lc-skill',
  schedule : 'lc-schedule',
};

// stage → emoji
const STAGE_EMOJI = {
  baby       : '👶',
  child      : '🧒',
  teen       : '🧑',
  youngAdult : '🙋',
  adult      : '🧔',
  elder      : '👴',
};

// skill → emoji
const SKILL_EMOJI = {
  cooking    : '🍳',
  logic      : '🧠',
  creativity : '🎨',
  fitness    : '💪',
  charisma   : '🗣️',
};

// slot type → emoji
const SLOT_EMOJI = {
  sleep    : '😴',
  eat      : '🍽️',
  fun      : '🎉',
  social   : '🤝',
  study    : '📚',
  work     : '💼',
};

// ── LifecycleNotifier class ───────────────────────────────────────
export class LifecycleNotifier {
  /**
   * @param {string} containerId  id of the host DOM element
   */
  constructor(containerId = 'lifecycle-toast') {
    this._el = document.getElementById(containerId);
    if (!this._el) {
      console.warn(`[LifecycleNotifier] host element #${containerId} not found`);
    }

    this._queue   = [];   // Array<{ html, category }>
    this._active  = null; // current toast DOM node
    this._timer   = null;

    this._subscribe();
  }

  // ── public ──────────────────────────────────────────────────────

  /** Force-clear all pending toasts and remove current one. */
  clear() {
    this._queue = [];
    if (this._active) {
      clearTimeout(this._timer);
      this._active.remove();
      this._active = null;
    }
  }

  /** Manually push a toast (used by external systems / tests). */
  push(html, category = 'lc-stage') {
    this._enqueue(html, category);
  }

  // ── private: event subscriptions ────────────────────────────────

  _subscribe() {
    bus.on('lifecycle:stageChanged', ({ sim, oldStage, newStage, age }) => {
      const emoji = STAGE_EMOJI[newStage] ?? '✨';
      const name  = sim?.name ?? 'Sim';
      this._enqueue(
        `${emoji} <b>${name}</b> is now a <b>${newStage}</b> — day ${age}`,
        CAT_CLASS.stage
      );
    });

    bus.on('career:promoted', ({ sim, career, oldLevel, newLevel, salary }) => {
      const name = sim?.name ?? 'Sim';
      this._enqueue(
        `🏆 <b>${name}</b> promoted to <b>${career} Lv.${newLevel}</b> — §${salary}/shift`,
        CAT_CLASS.promote
      );
    });

    bus.on('career:fired', ({ sim, career }) => {
      const name = sim?.name ?? 'Sim';
      this._enqueue(
        `💼❌ <b>${name}</b> was fired from <b>${career}</b>`,
        CAT_CLASS.fire
      );
    });

    bus.on('career:skillGain', ({ sim, skill, value }) => {
      // throttle: only show on integer milestones (1, 2, 3 …)
      const floor = Math.floor(value);
      if (Math.floor(value - 0.01) < floor) {
        const emoji = SKILL_EMOJI[skill] ?? '⭐';
        const name  = sim?.name ?? 'Sim';
        this._enqueue(
          `${emoji} <b>${name}</b> reached <b>${skill} ${floor}</b>`,
          CAT_CLASS.skill
        );
      }
    });

    bus.on('schedule:slotChanged', ({ sim, slot }) => {
      if (!slot) return;
      const emoji = SLOT_EMOJI[slot.type] ?? '📅';
      const name  = sim?.name ?? 'Sim';
      this._enqueue(
        `${emoji} <b>${name}</b> — ${slot.label ?? slot.type}`,
        CAT_CLASS.schedule
      );
    });
  }

  // ── private: queue & render ──────────────────────────────────────

  _enqueue(html, category) {
    if (this._queue.length >= MAX_QUEUE) this._queue.shift(); // drop oldest
    this._queue.push({ html, category });
    if (!this._active) this._showNext();
  }

  _showNext() {
    if (!this._el || this._queue.length === 0) {
      this._active = null;
      return;
    }

    const { html, category } = this._queue.shift();

    const node = document.createElement('div');
    node.className = `lc-toast ${category}`;
    node.innerHTML = html;
    this._el.appendChild(node);
    this._active = node;

    // auto-dismiss
    this._timer = setTimeout(() => {
      node.classList.add('lc-toast--out');
      setTimeout(() => {
        node.remove();
        this._active = null;
        this._showNext();
      }, ANIMATE_OUT);
    }, DISPLAY_MS);
  }
}

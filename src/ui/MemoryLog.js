import { bus }         from '../core/EventBus.js';
import { EMOTION_DEF } from '../entities/SimEmotions.js';
import { nameOf }      from './nameOf.js';

// memory:recorded comes from two MemorySystems: the per-Sim one sets a human-readable
// `description`, but the singleton (systems/MemorySystem) stores only `type` + `data`,
// so reading `memory.description` printed "undefined". Derive a label from the shape.
export function memoryText(memory) {
  if (memory?.description) return memory.description;
  const d = memory?.data ?? {};
  switch (memory?.type) {
    case 'social':      return `${String(d.type ?? 'interaction').replace(/_/g, ' ')} with ${nameOf(d.otherId) ?? d.otherName ?? 'someone'}`;
    case 'mood_peak':   return d.tier ? `felt ${d.tier}` : null;
    case 'need_crisis': return d.need ? `${d.need} crisis` : null;
    case 'life_event':  return d.text ?? d.label ?? d.event ?? null;
    default:            return memory?.type ? String(memory.type).replace(/_/g, ' ') : null;
  }
}

/**
 * MemoryLog — live scrolling feed of notable events.
 *
 * Shows a compact timeline of recent life events for all Sims:
 *  - Social interactions (positive / negative)
 *  - Goal completions and failures
 *  - Mood tier changes (only extreme: miserable / ecstatic)
 *  - Emotion spikes above threshold
 *  - Memory recordings (intensity > 0.6)
 *
 * Max 40 entries; older entries fade out and are removed.
 * Each entry has a category colour and an emoji prefix.
 * The log auto-scrolls to latest and collapses to an icon on mobile.
 *
 * Position: bottom-right corner, above NeedsPanel, z-index 110.
 */

const MAX_ENTRIES = 40;
const ENTRY_LIFETIME_MS = 18000; // entries disappear after 18s

const CAT_STYLE = {
  social_pos : { color: '#a5d6a7', icon: '💬' },
  social_neg : { color: '#ef9a9a', icon: '⚡' },
  goal_done  : { color: '#ffd54f', icon: '🎯' },
  goal_fail  : { color: '#90caf9', icon: '💔' },
  mood_up    : { color: '#ffd54f', icon: '⭐' },
  mood_down  : { color: '#ef9a9a', icon: '💀' },
  emotion    : { color: '#ce93d8', icon: '✨' },
  memory     : { color: '#80cbc4', icon: '📝' },
  story      : { color: '#ffcc80', icon: '📖' },
};

export class MemoryLog {
  constructor() {
    this._entries = []; // { id, html, expiresAt }
    this._panel   = this._createPanel();
    this._list    = this._panel.querySelector('.ml-list');
    this._toggle  = this._panel.querySelector('.ml-toggle');
    this._collapsed = false;
    this._counter   = 0;
    this._registerBus();
    this._injectCSS();
    this._startCleanup();
  }

  // ── Public ────────────────────────────────────────────────────────────────

  destroy() { this._panel.remove(); }

  // ── Private ───────────────────────────────────────────────────────────────

  _push(cat, text) {
    const id  = `mle-${++this._counter}`;
    const cs  = CAT_STYLE[cat] ?? CAT_STYLE.story;
    const now = Date.now();

    // Trim excess
    while (this._entries.length >= MAX_ENTRIES) {
      const old = this._entries.shift();
      document.getElementById(old.id)?.remove();
    }

    const el = document.createElement('div');
    el.id = id;
    el.className = 'ml-entry ml-enter';
    el.innerHTML = `
      <span class="ml-icon">${cs.icon}</span>
      <span class="ml-text" style="color:${cs.color}">${text}</span>
      <span class="ml-time">${this._clock()}</span>
    `;
    this._list.appendChild(el);
    this._list.scrollTop = this._list.scrollHeight;

    // Trigger enter animation
    requestAnimationFrame(() => el.classList.remove('ml-enter'));

    this._entries.push({ id, expiresAt: now + ENTRY_LIFETIME_MS });
  }

  _clock() {
    const h = window._game?.clock?.hour ?? 0;
    return `${String(h).padStart(2,'0')}:00`;
  }

  _startCleanup() {
    setInterval(() => {
      const now = Date.now();
      this._entries = this._entries.filter(e => {
        if (e.expiresAt < now) {
          const el = document.getElementById(e.id);
          if (el) {
            el.classList.add('ml-exit');
            setTimeout(() => el.remove(), 400);
          }
          return false;
        }
        return true;
      });
    }, 2000);
  }

  _createPanel() {
    let p = document.getElementById('memory-log');
    if (p) return p;
    p = document.createElement('div');
    p.id = 'memory-log';
    p.innerHTML = `
      <div class="ml-header">
        <span class="ml-title">📜 Life Events</span>
        <button class="ml-toggle" aria-label="Toggle log">−</button>
      </div>
      <div class="ml-list"></div>
    `;
    document.body.appendChild(p);

    p.querySelector('.ml-toggle').addEventListener('click', () => {
      this._collapsed = !this._collapsed;
      const list = p.querySelector('.ml-list');
      list.style.display = this._collapsed ? 'none' : 'block';
      p.querySelector('.ml-toggle').textContent = this._collapsed ? '+' : '−';
    });

    return p;
  }

  _injectCSS() {
    if (document.getElementById('memory-log-css')) return;
    const s = document.createElement('style');
    s.id = 'memory-log-css';
    s.textContent = `
      #memory-log {
        position: fixed;
        bottom: 140px;
        right: 12px;
        width: 240px;
        max-height: 220px;
        background: rgba(10,10,16,0.82);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 10px;
        z-index: 110;
        font-family: system-ui, sans-serif;
        font-size: 10px;
        backdrop-filter: blur(6px);
        overflow: hidden;
        box-shadow: 0 4px 20px #000a;
      }
      .ml-header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 6px 10px;
        border-bottom: 1px solid rgba(255,255,255,0.07);
      }
      .ml-title  { font-weight: 700; color: #eee; font-size: 10px; }
      .ml-toggle {
        background: none; border: none; color: #888;
        cursor: pointer; font-size: 14px; line-height: 1;
        padding: 0 2px;
      }
      .ml-list {
        max-height: 178px;
        overflow-y: auto;
        padding: 4px 8px;
        scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,0.15) transparent;
      }
      .ml-entry {
        display: flex; align-items: baseline; gap: 5px;
        padding: 3px 0;
        border-bottom: 1px solid rgba(255,255,255,0.04);
        transition: opacity 0.35s ease, transform 0.35s ease;
      }
      .ml-enter { opacity: 0; transform: translateX(10px); }
      .ml-exit  { opacity: 0; transform: translateX(-10px); }
      .ml-icon  { flex-shrink: 0; font-size: 12px; }
      .ml-text  { flex: 1; line-height: 1.35; }
      .ml-time  { flex-shrink: 0; color: #555; font-size: 9px; }
    `;
    document.head.appendChild(s);
  }

  _registerBus() {
    // Life Events is the household's feed: only show events involving a family member.
    // population.isHouseholdMember is authoritative (off-lot family included, neighbours
    // /relatives excluded); when population isn't ready we don't hide. Keeps externals
    // like the relative Mara out of the family log.
    const hh = id => {
      const pop = window._game?.population;
      return pop?.isHouseholdMember ? pop.isHouseholdMember(id) : true;
    };

    bus.on('social:interaction', ({ idA, idB, delta, type }) => {
      if (!hh(idA) && !hh(idB)) return;
      const cat = (delta ?? 0) >= 0 ? 'social_pos' : 'social_neg';
      this._push(cat, `${nameOf(idA)} → ${nameOf(idB)}: ${type ?? 'chat'} (Δ${delta >= 0 ? '+' : ''}${delta})`);
    });

    bus.on('goal:completed', ({ simId, goal }) => {
      if (!hh(simId)) return;
      this._push('goal_done', `${nameOf(simId)} achieved: ${goal.label}`);
    });

    bus.on('goal:failed', ({ simId, goal }) => {
      if (!hh(simId)) return;
      this._push('goal_fail', `${nameOf(simId)} failed: ${goal.label}`);
    });

    bus.on('sim:moodChanged', ({ simId, from, to }) => {
      if (to !== 'ecstatic' && to !== 'miserable') return; // only extremes
      if (!hh(simId)) return;
      const cat = to === 'ecstatic' ? 'mood_up' : 'mood_down';
      this._push(cat, `${nameOf(simId)} is now ${to}`);
    });

    bus.on('emotion:spike', ({ simId, type, intensity }) => {
      if ((intensity ?? 0) < 0.65) return; // only intense spikes
      if (!hh(simId)) return;
      const def = EMOTION_DEF[type] ?? { emoji:'✨', label: type };
      this._push('emotion', `${nameOf(simId)} feels ${def.emoji} ${def.label}`);
    });

    bus.on('memory:recorded', ({ simId, memory }) => {
      if ((memory?.intensity ?? 0) < 0.65) return; // only strong memories
      if (!hh(simId)) return;
      const text = memoryText(memory);
      if (!text) return; // nothing meaningful → don't print "undefined"
      this._push('memory', `${nameOf(simId)}: "${text}"`);
    });

    bus.on('story:entry', e => {
      const ids = [e.simId, e.idA, e.idB, e.personId, e.childId].filter(Boolean);
      if (ids.length && !ids.some(hh)) return; // about specific non-household people
      this._push('story', e.text);
    });
  }
}

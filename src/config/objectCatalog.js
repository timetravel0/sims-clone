import { bus } from '../core/EventBus.js';
import cfg from './gameConfig.js';

// Helper: merge utility/price from gameConfig into a catalog entry
const oc = (id, base) => {
  const c = cfg.objects[id] ?? {};
  if (c.utility && base.affordances) {
    base.affordances = base.affordances.map(a => ({ ...a, utility: { ...c.utility } }));
  }
  if (c.price) base.price = c.price;
  return base;
};

/**
 * objectCatalog.js — data definitions for all placeable objects.
 *
 * Extracted from ObjectRegistry/AutonomousShoppingSystem so the catalogue lives
 * in one place (Stream B). `onUse` is kept as a JS closure here; when these move
 * to SQLite definition tables the behaviour hooks will need a data-driven form.
 *
 * social: true → furniture meant for shared use (extra "Invite" options, bonus
 * social points when used near another Sim).
 */

export const OBJECT_DEFS = [
  oc('bed',       { id: 'bed',       label: 'Bed',          color: 0x6b9ac4, needTarget: 'energy',  restoreRate: 30,
    affordances: [{ verb: 'sleep',      label: 'Sleep',     utility: { energy: 45, autonomy: 8 },                           duration: 8 }] }),
  oc('fridge',    { id: 'fridge',    label: 'Fridge',       color: 0xd0ece7, needTarget: 'hunger',  restoreRate: 40,
    affordances: [{ verb: 'eat',        label: 'Eat',       utility: { hunger: 45, comfort: 4 },                            duration: 5 }] }),
  oc('toilet',    { id: 'toilet',    label: 'Toilet',       color: 0xf0f0e8, needTarget: 'bladder', restoreRate: 60,
    affordances: [{ verb: 'use_toilet', label: 'Use Toilet',utility: { bladder: 60, autonomy: 2 },                          duration: 4 }] }),
  oc('shower',    { id: 'shower',    label: 'Shower',       color: 0xa8d8ea, needTarget: 'hygiene', restoreRate: 35,
    affordances: [{ verb: 'shower',     label: 'Shower',    utility: { hygiene: 45, comfort: 5 },                           duration: 6 }] }),
  oc('lamp',      { id: 'lamp',      label: 'Lamp',         color: 0xffdd88, needTarget: 'room',    restoreRate: 10,
    affordances: [{ verb: 'admire_lamp',label: 'Admire',    utility: { room: 15, status: 5 },                               duration: 3 }] }),
  oc('treadmill', { id: 'treadmill', label: 'Treadmill',    color: 0xb0bec5, needTarget: 'comfort', restoreRate: 8,
    onUse: (sim) => sim.needs.decay('energy', 3) }),
  oc('desk',      { id: 'desk',      label: 'Desk',         color: 0xa1887f, needTarget: 'fun',     restoreRate: 10,
    affordances: [{ verb: 'study',      label: 'Study',     utility: { autonomy: 20, status: 8, fun: 8, energy: -6 },      duration: 6, skillGain: true }] }),
  oc('bookshelf', { id: 'bookshelf', label: 'Bookshelf',    color: 0x8d6e63, needTarget: 'fun',     restoreRate: 12,
    affordances: [{ verb: 'read',       label: 'Read',      utility: { autonomy: 25, fun: 12, status: 4 },                 duration: 6, skillGain: true }],
    onUse: (sim) => sim.needs.restore('social', 2) }),
  oc('workbench', { id: 'workbench', label: 'Workbench',    color: 0x90a4ae, needTarget: 'fun',     restoreRate: 10,
    affordances: [{ verb: 'tinker',     label: 'Tinker',    utility: { fun: 18, status: 14, autonomy: 20, energy: -5 },    duration: 6, skillGain: true }] }),

  // ── Social furniture (social: true) ──────────────────────────────────────
  oc('couch', {
    id: 'couch',    label: 'Couch (social)', color: 0xc9a96e,
    needTarget: 'comfort', restoreRate: 20, social: true,
    affordances: [{ verb: 'relax',     label: 'Relax',     utility: { comfort: 28, social: 6, autonomy: 5 }, duration: 5 }],
    onUse: (sim) => sim.needs.restore('social', 8),
  }),
  oc('tv', {
    id: 'tv',       label: 'TV (social)',    color: 0x1a1a2e,
    needTarget: 'fun',     restoreRate: 20, social: true,
    affordances: [{ verb: 'watch_tv',  label: 'Watch TV',  utility: { fun: 28, social: 5, autonomy: 4 }, duration: 5 }],
    onUse: (sim) => sim.needs.restore('social', 5),
  }),
  oc('bar', {
    id: 'bar',      label: 'Bar',            color: 0xd4a017,
    needTarget: 'social',  restoreRate: 35, social: true,
    affordances: [{ verb: 'show_off',  label: 'Show Off',  utility: { social: 25, status: 20, fun: 12, energy: -5 }, duration: 5 }],
    onUse: (sim) => { sim.needs.restore('fun', 10); sim.needs.restore('hunger', 5); },
  }),
  oc('chess', {
    id: 'chess',    label: 'Chess Table',    color: 0x4a4a4a,
    needTarget: 'fun',     restoreRate: 22, social: true,
    affordances: [{ verb: 'play_chess',label: 'Play Chess', utility: { fun: 20, autonomy: 18, status: 10 }, duration: 7, skillGain: true }],
    onUse: (sim) => sim.needs.restore('social', 12),
  }),
  oc('piano', {
    id: 'piano',    label: 'Piano',          color: 0x212121,
    needTarget: 'fun',     restoreRate: 25, social: true,
    affordances: [{ verb: 'play_piano',label: 'Play Piano', utility: { fun: 22, status: 22, autonomy: 8 }, duration: 7, skillGain: true }],
    onUse: (sim) => sim.needs.restore('social', 5),
  }),
  oc('hot_tub', {
    id: 'hot_tub',  label: 'Hot Tub',        color: 0x26c6da,
    needTarget: 'comfort', restoreRate: 30, social: true,
    affordances: [{ verb: 'soak',      label: 'Soak',      utility: { comfort: 35, social: 15, hygiene: 5 }, duration: 7 }],
    onUse: (sim) => { sim.needs.restore('hygiene', 5); sim.needs.restore('social', 15); },
  }),
  oc('dining_table', {
    id: 'dining_table', label: 'Dining Table', color: 0x795548,
    needTarget: 'hunger',  restoreRate: 25, social: true,
    affordances: [{ verb: 'dine',      label: 'Dine',      utility: { hunger: 28, social: 10, status: 4 }, duration: 5 }],
    onUse: (sim) => sim.needs.restore('social', 10),
  }),
  oc('phone', {
    id: 'phone',    label: 'Telefono',        color: 0x455a64,
    needTarget: 'social', restoreRate: 0, social: false,
    affordances: [{ verb: 'call',      label: 'Chiama',    utility: { social: 8, fun: 4 }, duration: 3 }],
    onUse: (sim) => bus.emit('phone:used', { sim }),
  }),
  oc('fire_pit', {
    id: 'fire_pit', label: 'Fire Pit',       color: 0xff6f00,
    needTarget: 'social',  restoreRate: 30, social: true,
    affordances: [{ verb: 'gather',    label: 'Gather',    utility: { social: 28, fun: 12, comfort: 8 }, duration: 6 }],
    onUse: (sim) => { sim.needs.restore('fun', 8); sim.needs.restore('comfort', 5); },
  }),
];

// Single source of truth: which object trains which skill (used by SkillSystem,
// CareerSystem and the build catalogue). Skill is exposed as def.skill.
export const SKILL_BY_OBJECT = {
  fridge:       'cooking',
  bookshelf:    'logic',
  desk:         'logic',
  chess:        'logic',
  treadmill:    'fitness',
  hot_tub:      'fitness',
  workbench:    'handiness',
  piano:        'creativity',
  couch:        'charisma',
  tv:           'charisma',
  bar:          'charisma',
  fire_pit:     'charisma',
  dining_table: 'charisma',
};

// Purchase prices — sourced from gameConfig.json
export const OBJECT_COSTS = Object.fromEntries(
  Object.entries(cfg.objects).map(([id, o]) => [id, o.price ?? 0])
);

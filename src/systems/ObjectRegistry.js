/**
 * ObjectRegistry — central catalog of all placeable object types.
 *
 * social: true  → furniture meant for shared use (sofa, bar, chess table).
 *   These get extra "Invite" options in the context menu and give bonus
 *   social points when used near another Sim.
 */

const _registry = new Map();

export const ObjectRegistry = {
  register(def) {
    if (!def.id || !def.label) throw new Error('ObjectRegistry: id and label required');
    _registry.set(def.id, { width: 1, height: 1, onUse: null, social: false, ...def });
  },
  get(id)  { return _registry.get(id) || null; },
  all()    { return [..._registry.values()]; },
  has(id)  { return _registry.has(id); },
};

// ─── Built-in objects ────────────────────────────────────────────────────────
const DEFAULTS = [
  // Need-restoring objects
  { id: 'bed',       label: 'Bed',          color: 0x6b9ac4, needTarget: 'energy',  restoreRate: 30 },
  { id: 'fridge',    label: 'Fridge',       color: 0xd0ece7, needTarget: 'hunger',  restoreRate: 40 },
  { id: 'toilet',    label: 'Toilet',       color: 0xf0f0e8, needTarget: 'bladder', restoreRate: 60 },
  { id: 'shower',    label: 'Shower',       color: 0xa8d8ea, needTarget: 'hygiene', restoreRate: 35 },
  { id: 'lamp',      label: 'Lamp',         color: 0xffdd88, needTarget: 'room',    restoreRate: 10 },
  { id: 'treadmill', label: 'Treadmill',    color: 0xb0bec5, needTarget: 'comfort', restoreRate: 8,
    onUse: (sim) => sim.needs.decay('energy', 3) },
  { id: 'desk',      label: 'Desk',         color: 0xa1887f, needTarget: 'fun',     restoreRate: 10 },
  { id: 'bookshelf', label: 'Bookshelf',    color: 0x8d6e63, needTarget: 'fun',     restoreRate: 12,
    onUse: (sim) => sim.needs.restore('social', 2) },

  // ── Social furniture (social: true) ──────────────────────────────────────
  {
    id: 'couch',    label: 'Couch (social)', color: 0xc9a96e,
    needTarget: 'comfort', restoreRate: 20, social: true,
    onUse: (sim) => sim.needs.restore('social', 8),
  },
  {
    id: 'tv',       label: 'TV (social)',    color: 0x1a1a2e,
    needTarget: 'fun',     restoreRate: 20, social: true,
    onUse: (sim) => sim.needs.restore('social', 5),
  },
  {
    id: 'bar',      label: 'Bar',            color: 0xd4a017,
    needTarget: 'social',  restoreRate: 35, social: true,
    onUse: (sim) => {
      sim.needs.restore('fun', 10);
      sim.needs.restore('hunger', 5);
    },
  },
  {
    id: 'chess',    label: 'Chess Table',    color: 0x4a4a4a,
    needTarget: 'fun',     restoreRate: 22, social: true,
    onUse: (sim) => sim.needs.restore('social', 12),
  },
  {
    id: 'piano',    label: 'Piano',          color: 0x212121,
    needTarget: 'fun',     restoreRate: 25, social: true,
    onUse: (sim) => sim.needs.restore('social', 5),
  },
  {
    id: 'hot_tub',  label: 'Hot Tub',        color: 0x26c6da,
    needTarget: 'comfort', restoreRate: 30, social: true,
    onUse: (sim) => {
      sim.needs.restore('hygiene', 5);
      sim.needs.restore('social',  15);
    },
  },
  {
    id: 'dining_table', label: 'Dining Table', color: 0x795548,
    needTarget: 'hunger',  restoreRate: 25, social: true,
    onUse: (sim) => sim.needs.restore('social', 10),
  },
  {
    id: 'fire_pit', label: 'Fire Pit',       color: 0xff6f00,
    needTarget: 'social',  restoreRate: 30, social: true,
    onUse: (sim) => {
      sim.needs.restore('fun', 8);
      sim.needs.restore('comfort', 5);
    },
  },
];

for (const def of DEFAULTS) ObjectRegistry.register(def);

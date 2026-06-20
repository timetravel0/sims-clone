/**
 * ObjectRegistry — central catalog of all placeable object types.
 *
 * Register custom objects at startup:
 *   ObjectRegistry.register({
 *     id: 'piano',
 *     label: 'Piano',
 *     color: 0x1a1a1a,
 *     needTarget: 'fun',
 *     restoreRate: 25,
 *     width: 2,      // tiles wide (default 1)
 *     height: 1,
 *     onUse: (sim, furniture, dt) => { ... }  // optional custom update hook
 *   });
 *
 * All registered objects automatically appear in Build Mode.
 */

const _registry = new Map();

export const ObjectRegistry = {
  /** Register a new object type */
  register(def) {
    if (!def.id || !def.label) throw new Error('ObjectRegistry: id and label required');
    _registry.set(def.id, {
      width: 1,
      height: 1,
      onUse: null,
      ...def,
    });
  },

  /** Get definition by id */
  get(id) { return _registry.get(id) || null; },

  /** All registered definitions */
  all() { return [..._registry.values()]; },

  /** Check if id exists */
  has(id) { return _registry.has(id); },
};

// ─── Default built-in objects ───────────────────────────────────────────────
const DEFAULTS = [
  { id: 'bed',       label: 'Bed',       color: 0x6b9ac4, needTarget: 'energy',  restoreRate: 30 },
  { id: 'fridge',    label: 'Fridge',    color: 0xd0ece7, needTarget: 'hunger',  restoreRate: 40 },
  { id: 'toilet',    label: 'Toilet',    color: 0xf0f0e8, needTarget: 'bladder', restoreRate: 60 },
  { id: 'couch',     label: 'Couch',     color: 0xc9a96e, needTarget: 'comfort', restoreRate: 20 },
  { id: 'tv',        label: 'TV',        color: 0x1a1a2e, needTarget: 'fun',     restoreRate: 20 },
  { id: 'shower',    label: 'Shower',    color: 0xa8d8ea, needTarget: 'hygiene', restoreRate: 35 },
  { id: 'lamp',      label: 'Lamp',      color: 0xffdd88, needTarget: 'room',    restoreRate: 10 },
  { id: 'bookshelf', label: 'Bookshelf', color: 0x8d6e63, needTarget: 'fun',     restoreRate: 12,
    onUse: (sim) => sim.needs.restore('social', 2) },
  { id: 'piano',     label: 'Piano',     color: 0x212121, needTarget: 'fun',     restoreRate: 25,
    onUse: (sim) => sim.needs.restore('social', 5) },
  { id: 'treadmill', label: 'Treadmill', color: 0xb0bec5, needTarget: 'comfort', restoreRate: 8,
    onUse: (sim) => { sim.needs.restore('energy', -3); } },
  { id: 'desk',      label: 'Desk',      color: 0xa1887f, needTarget: 'fun',     restoreRate: 10 },
  { id: 'hot_tub',   label: 'Hot Tub',   color: 0x26c6da, needTarget: 'comfort', restoreRate: 30,
    onUse: (sim) => { sim.needs.restore('hygiene', 5); sim.needs.restore('social', 3); } },
];

for (const def of DEFAULTS) ObjectRegistry.register(def);

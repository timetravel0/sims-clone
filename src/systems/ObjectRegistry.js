/**
 * ObjectRegistry — central catalog of all placeable object types.
 *
 * Object definitions live in src/config/objectCatalog.js (Stream B); this module
 * registers them and exposes lookup helpers.
 *
 * social: true  → furniture meant for shared use (sofa, bar, chess table).
 *   These get extra "Invite" options in the context menu and give bonus
 *   social points when used near another Sim.
 */
import { OBJECT_DEFS, SKILL_BY_OBJECT } from '../config/objectCatalog.js';

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

// Re-exported for back-compat: SkillSystem imports SKILL_BY_OBJECT from here.
export { SKILL_BY_OBJECT };

for (const def of OBJECT_DEFS) {
  def.skill = SKILL_BY_OBJECT[def.id] ?? null;
  ObjectRegistry.register(def);
}

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
let _customSeq = 0;

function _cloneAffordances(affordances = []) {
  return (affordances ?? []).map(aff => ({
    ...aff,
    utility: aff.utility ? { ...aff.utility } : undefined,
  }));
}

function _normalizeCustom(def = {}) {
  const id = def.id || `custom_object_${++_customSeq}`;
  const useEffects = def.useEffects ?? def.onUseEffects ?? null;
  const onUse = typeof def.onUse === 'function'
    ? def.onUse
    : useEffects
      ? (sim) => {
          if (!sim?.needs || typeof useEffects !== 'object') return;
          for (const [need, amount] of Object.entries(useEffects)) {
            if (typeof amount !== 'number') continue;
            if (amount >= 0) sim.needs.restore?.(need, amount);
            else sim.needs.delta?.(need, amount);
          }
        }
      : null;
  return {
    width: 1,
    height: 1,
    onUse,
    social: false,
    custom: true,
    ...def,
    id,
    affordances: _cloneAffordances(def.affordances),
    useEffects: useEffects ? { ...useEffects } : null,
  };
}

function _serialisableCustom(def) {
  return {
    id: def.id,
    label: def.label,
    color: def.color,
    width: def.width,
    height: def.height,
    needTarget: def.needTarget ?? null,
    restoreRate: def.restoreRate ?? null,
    social: !!def.social,
    skill: def.skill ?? null,
    cost: def.cost ?? null,
    description: def.description ?? null,
    affordances: _cloneAffordances(def.affordances),
    useEffects: def.useEffects ? { ...def.useEffects } : null,
    custom: true,
  };
}

export const ObjectRegistry = {
  register(def) {
    if (!def.id || !def.label) throw new Error('ObjectRegistry: id and label required');
    _registry.set(def.id, { width: 1, height: 1, onUse: null, social: false, ...def });
  },
  registerCustom(def) {
    const normalized = _normalizeCustom(def);
    this.register(normalized);
    return this.get(normalized.id);
  },
  get(id)  { return _registry.get(id) || null; },
  all()    { return [..._registry.values()]; },
  has(id)  { return _registry.has(id); },
  clearCustom() {
    for (const [id, def] of [..._registry.entries()]) {
      if (def.custom) _registry.delete(id);
    }
  },
  serialiseCustom() {
    return this.all().filter(def => def.custom).map(_serialisableCustom);
  },
  restoreCustom(defs = []) {
    this.clearCustom();
    for (const def of defs ?? []) this.registerCustom(def);
  },
};

// Re-exported for back-compat: SkillSystem imports SKILL_BY_OBJECT from here.
export { SKILL_BY_OBJECT };

for (const def of OBJECT_DEFS) {
  def.skill = SKILL_BY_OBJECT[def.id] ?? null;
  ObjectRegistry.register(def);
}

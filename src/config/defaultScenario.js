/**
 * defaultScenario.js — the starting scenario: household, off-lot people, starter
 * careers and the lot's initial furniture layout (Stream B extraction). This is
 * the single object a future scenario loader / SQLite `scenario_defs` row maps to.
 */
import { SIM_DEFS, DEFAULT_EXTERNALS, STARTER_CAREERS } from './defaultPopulation.js';

// Default house furniture: skill objects included so every skill has a source
// out of the box. Consumed by World._placeFurniture.
export const DEFAULT_HOUSE_FURNITURE = [
  { id: 'bed',    gx: 3,  gz: 3,  color: 0x6b9ac4, needTarget: 'energy',  restoreRate: 30 },
  { id: 'fridge', gx: 12, gz: 3,  color: 0xd0ece7, needTarget: 'hunger',  restoreRate: 40 },
  { id: 'toilet', gx: 12, gz: 12, color: 0xf0f0e8, needTarget: 'bladder', restoreRate: 60 },
  { id: 'couch',  gx: 3,  gz: 12, color: 0xc9a96e, needTarget: 'comfort', restoreRate: 20 },
  { id: 'tv',     gx: 8,  gz: 5,  color: 0x1a1a2e, needTarget: 'fun',     restoreRate: 20 },
  { id: 'shower', gx: 8,  gz: 12, color: 0xa8d8ea, needTarget: 'hygiene', restoreRate: 35 },
  { id: 'bookshelf', gx: 5, gz: 3,  color: 0x8d6e63, needTarget: 'fun', restoreRate: 12 }, // logic
  { id: 'desk',      gx: 6, gz: 3,  color: 0xa1887f, needTarget: 'fun', restoreRate: 10 }, // logic
  { id: 'piano',     gx: 3, gz: 8,  color: 0x212121, needTarget: 'fun', restoreRate: 25 }, // creativity
  { id: 'treadmill', gx: 12, gz: 8, color: 0xb0bec5, needTarget: 'comfort', restoreRate: 8 }, // fitness
  { id: 'workbench', gx: 6, gz: 12, color: 0x90a4ae, needTarget: 'fun', restoreRate: 10 }, // handiness
];

export const DEFAULT_SCENARIO = {
  householdName: 'The Household',
  sims: SIM_DEFS,
  externals: DEFAULT_EXTERNALS,
  starterCareers: STARTER_CAREERS,
  houseFurniture: DEFAULT_HOUSE_FURNITURE,
};

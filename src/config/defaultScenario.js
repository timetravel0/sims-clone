/**
 * defaultScenario.js — the starting scenario: household, off-lot people, starter
 * careers and the lot's initial furniture layout (Stream B extraction). This is
 * the single object a future scenario loader / SQLite `scenario_defs` row maps to.
 */
import { SIM_DEFS, DEFAULT_EXTERNALS, STARTER_CAREERS } from './defaultPopulation.js';

// Default house furniture — the MINIMAL but COMPLETE starter set: one object per
// function so a new family can satisfy every need and train every skill out of
// the box, organised by functional zone. Consumed by World._placeFurniture.
//
//   need coverage:  energy, hunger, bladder, hygiene, comfort, fun, room (+ social
//                   via social:true objects); food lifecycle (storage→prep→cook→
//                   wash→eat) fully equipped.
//   skill coverage: cooking(fridge) logic(desk) creativity(piano) fitness(treadmill)
//                   handiness(workbench) charisma(couch/tv/dining_table).
export const DEFAULT_HOUSE_FURNITURE = [
  // ── Bedroom (sleep + ambience) ──
  { id: 'bed',    gx: 2,  gz: 2,  color: 0x6b9ac4, needTarget: 'energy',  restoreRate: 30 },
  { id: 'lamp',   gx: 4,  gz: 2,  color: 0xffdd88, needTarget: 'room',    restoreRate: 10 },
  // ── Study (logic) ──
  { id: 'desk',   gx: 6,  gz: 2,  color: 0xa1887f, needTarget: 'fun',     restoreRate: 10 },
  // ── Kitchen (food lifecycle: storage → prep → cook → wash) ──
  { id: 'fridge', gx: 12, gz: 2,  color: 0xd0ece7, needTarget: 'hunger',  restoreRate: 40 },
  { id: 'counter',gx: 12, gz: 3,  color: 0xbcaaa4 },
  { id: 'stove',  gx: 12, gz: 4,  color: 0x9e9e9e },
  { id: 'sink',   gx: 11, gz: 4,  color: 0xcfd8dc },
  // ── Dining (eat + charisma) ──
  { id: 'dining_table', gx: 9, gz: 4, color: 0x795548, needTarget: 'hunger', restoreRate: 25 },
  // ── Living (comfort + fun + social) ──
  { id: 'couch',  gx: 2,  gz: 12, color: 0xc9a96e, needTarget: 'comfort', restoreRate: 20 },
  { id: 'tv',     gx: 4,  gz: 12, color: 0x1a1a2e, needTarget: 'fun',     restoreRate: 20 },
  // ── Bathroom (bladder + hygiene) ──
  { id: 'toilet', gx: 12, gz: 12, color: 0xf0f0e8, needTarget: 'bladder', restoreRate: 60 },
  { id: 'shower', gx: 10, gz: 12, color: 0xa8d8ea, needTarget: 'hygiene', restoreRate: 35 },
  // ── Hobby & skills (creativity / fitness / handiness) ──
  { id: 'piano',     gx: 2, gz: 9,  color: 0x212121, needTarget: 'fun',     restoreRate: 25 },
  { id: 'treadmill', gx: 8, gz: 12, color: 0xb0bec5, needTarget: 'comfort', restoreRate: 8 },
  { id: 'workbench', gx: 6, gz: 12, color: 0x90a4ae, needTarget: 'fun',     restoreRate: 10 },
  // ── Communication (calls / invites) ──
  { id: 'phone',  gx: 9,  gz: 8,  color: 0x455a64, needTarget: 'social',  restoreRate: 0 },
];

export const DEFAULT_SCENARIO = {
  householdName: 'The Household',
  sims: SIM_DEFS,
  externals: DEFAULT_EXTERNALS,
  starterCareers: STARTER_CAREERS,
  houseFurniture: DEFAULT_HOUSE_FURNITURE,
};

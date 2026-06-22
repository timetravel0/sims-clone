/**
 * defaultPopulation.js — starting household, trait mapping, starter careers and
 * the off-lot people seeded into the world (Stream B extraction).
 */

// Initial household used when no save exists and the SimCreator is skipped.
export const SIM_DEFS = [
  { name: 'Alice', color: 0x4fc3f7, traits: { outgoing: 0.7, playful: 0.5, nice: 0.6 } },
  { name: 'Bob',   color: 0xef9a9a, traits: { neurotic: 0.6, ambitious: 0.8 } },
  { name: 'Cleo',  color: 0xa5d6a7, traits: { nice: 0.9, outgoing: -0.3 } },
];

// Map SimCreator string traits onto the 5 personality axes.
export const TRAIT_AXIS = {
  Outgoing: { outgoing: 0.8 }, Shy: { outgoing: -0.7 }, Bookworm: { outgoing: -0.3 },
  Playful: { playful: 0.8 }, Active: { playful: 0.5 }, Serious: { playful: -0.5 },
  Nice: { nice: 0.8 }, Grouchy: { nice: -0.7 }, Romantic: { nice: 0.4 },
  Lazy: { ambitious: -0.6 }, Creative: { playful: 0.4 }, Logical: { neurotic: -0.3 },
};

// Round-robin starter careers so the career world is alive from launch.
export const STARTER_CAREERS = ['scientist', 'chef', 'artist', 'programmer', 'athlete'];

// Off-lot people seeded by PopulationSystem (visitor/townie archetypes).
export const DEFAULT_EXTERNALS = [
  { name: 'Dana', color: 0xba68c8, role: 'neighbor', traits: { outgoing: 0.6, nice: 0.4 } },
  { name: 'Eli',  color: 0x4db6ac, role: 'friend',   traits: { playful: 0.7, nice: 0.5 } },
  { name: 'Mara', color: 0xffb74d, role: 'relative',  traits: { nice: 0.8, neurotic: 0.3 } },
  { name: 'Vic',  color: 0x90a4ae, role: 'coworker', traits: { ambitious: 0.7, outgoing: -0.2 } },
];

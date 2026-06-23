// ponytail: monkey-patch Math.random so all existing call sites get seeding for free
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Call once at game startup. Reads ?seed= from the URL; no-op if absent. */
export function initRng() {
  const param = new URLSearchParams(window.location.search).get('seed');
  if (!param) return;
  const seed = parseInt(param, 10);
  if (!Number.isFinite(seed)) return;
  Math.random = mulberry32(seed);
  console.info(`[Rng] seeded with ${seed}`);
}

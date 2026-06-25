/**
 * Resolve a sim/person id to a display name.
 *
 * The population registry is authoritative for ALL people — household members, off-lot
 * externals (neighbours, relatives, coworkers, friends) and anyone born/grown in the
 * background — whereas `game.sims` only holds the Sims currently spawned on the lot.
 * Resolving against `sims` alone left every off-lot person showing their raw `p_<uuid>`
 * id in the UI (e.g. the relative Mara → "p_362b9430-…"). Population first, then the
 * on-lot sims, then the id as a last resort.
 */
export function nameOf(id, game = (typeof window !== 'undefined' ? window._game : null)) {
  return game?.population?.getPerson?.(id)?.name
      ?? game?.sims?.find?.(s => s.id === id)?.name
      ?? id;
}

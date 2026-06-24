/**
 * LocationService — WP6 / Milestone 10.
 *
 * Pure helpers that answer "where is this Sim, and why?" from live state. Used by
 * the UI (selected-Sim panel, roster tooltips) and by headless time-by-location
 * metrics. No subscriptions, no state — just a snapshot descriptor.
 *
 * Descriptor: { mode, activity, reason, roomType?, objectId?, objectLabel?, gx?, gz?, action? }
 *   mode: 'on_lot' | 'work' | 'outing' | 'visiting' | 'medical' | 'unknown'
 */

function nearestObject(world, sim) {
  if (!world?.furniture) return null;
  return world.furniture.find(f =>
    Math.max(Math.abs(f.gx - sim.gx), Math.abs(f.gz - sim.gz)) <= 1) ?? null;
}

const OUTING_LABEL = {
  meal_out: 'eating out', trip: 'on a trip', visit_friend: 'visiting a friend',
  work: 'at work', medical: 'at the doctor', other: 'out',
};

/** Friendly activity from the current action label + adjacent object. */
export function describeActivity(action, obj) {
  if (!action) return 'idle';
  const head = String(action).split('(')[0];
  const map = {
    Sleep: 'sleeping', CookMeal: 'cooking & eating', Social: 'socialising',
    WalkTo: 'walking', Idle: 'idle', Shower: 'showering', Study: 'studying',
    Read: 'reading', Relax: 'relaxing',
  };
  if (map[head]) return map[head];
  if (obj?.label) return `using the ${obj.label.toLowerCase()}`;
  return head.toLowerCase();
}

/** Snapshot of where a Sim is and what they're doing. */
export function describeLocation(sim, ctx = {}) {
  if (!sim) return { mode: 'unknown', activity: 'unknown', reason: null };
  const action = sim.currentAction ?? null;

  if (sim._atWork) {
    return { mode: 'work', activity: 'at work', reason: 'shift', action };
  }
  if (sim._outing) {
    const reason = sim._outingReason ?? sim._offLotReason ?? 'other';
    const mode = reason === 'medical' ? 'medical' : 'outing';
    return { mode, activity: OUTING_LABEL[reason] ?? 'out', reason, action, untilTick: sim._outingUntilTick ?? null };
  }
  if (sim._visitorMode) {
    return { mode: 'visiting', activity: 'visiting', reason: sim._visitorMode.reason ?? 'visit', action };
  }

  const room = ctx.roomDetector?.roomAt?.(sim.gx, sim.gz) ?? null;
  const obj  = nearestObject(ctx.world, sim);
  return {
    mode: 'on_lot',
    lotId: 'home',
    gx: sim.gx, gz: sim.gz,
    roomId: room?.id ?? null,
    roomType: room?.type ?? 'open area',
    objectId: obj?.id ?? null,
    objectLabel: obj?.label ?? null,
    action,
    activity: describeActivity(action, obj),
    reason: sim.brain?._planner?.lastNeedLabel || null,
  };
}

/** One-line human summary, e.g. "in the kitchen, cooking & eating". */
export function locationSummary(sim, ctx = {}) {
  const d = describeLocation(sim, ctx);
  if (d.mode === 'work')     return 'at work';
  if (d.mode === 'visiting') return 'visiting';
  if (d.mode === 'medical')  return 'at the doctor';
  if (d.mode === 'outing')   return d.activity;
  if (d.mode === 'unknown')  return 'unknown';
  const where = d.roomType && d.roomType !== 'open area' ? `in the ${d.roomType}` : 'on the lot';
  return `${where}, ${d.activity}`;
}

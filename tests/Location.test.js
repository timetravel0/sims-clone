import { describe, it, expect } from 'vitest';
import { describeLocation, describeActivity, locationSummary } from '../src/systems/LocationService.js';

function fakeSim(over = {}) {
  return {
    gx: 5, gz: 5,
    currentAction: over.currentAction ?? null,
    _atWork: false, _outing: false, _visitorMode: null,
    brain: { _planner: { lastNeedLabel: over.needLabel ?? '' } },
    ...over,
  };
}

const roomDetector = { roomAt: (x, z) => (x === 5 && z === 5 ? { type: 'kitchen' } : null) };
const world = { furniture: [{ id: 'fridge', label: 'Fridge', gx: 5, gz: 6 }] };
const ctx = { roomDetector, world };

describe('describeActivity', () => {
  it('maps known action labels to friendly verbs', () => {
    expect(describeActivity('Sleep(bed_1)')).toBe('sleeping');
    expect(describeActivity('CookMeal')).toBe('cooking & eating');
    expect(describeActivity('WalkTo(3,4)')).toBe('walking');
  });
  it('falls back to the adjacent object when the action is unknown', () => {
    expect(describeActivity('Frobnicate', { label: 'Piano' })).toBe('using the piano');
  });
  it('returns idle when there is no action', () => {
    expect(describeActivity(null)).toBe('idle');
  });
});

describe('describeLocation', () => {
  it('reports work when the Sim is at work', () => {
    const d = describeLocation(fakeSim({ _atWork: true }), ctx);
    expect(d.mode).toBe('work');
    expect(d.activity).toBe('at work');
  });

  it('reports an outing with its reason', () => {
    const d = describeLocation(fakeSim({ _outing: true, _outingReason: 'meal_out' }), ctx);
    expect(d.mode).toBe('outing');
    expect(d.activity).toBe('eating out');
  });

  it('routes a medical outing to the medical mode', () => {
    const d = describeLocation(fakeSim({ _outing: true, _outingReason: 'medical' }), ctx);
    expect(d.mode).toBe('medical');
  });

  it('reports on-lot room, coords and nearby object', () => {
    const d = describeLocation(fakeSim({ currentAction: 'CookMeal' }), ctx);
    expect(d.mode).toBe('on_lot');
    expect(d.roomType).toBe('kitchen');
    expect(d.gx).toBe(5);
    expect(d.objectLabel).toBe('Fridge');
    expect(d.activity).toBe('cooking & eating');
  });
});

describe('locationSummary', () => {
  it('gives a one-line on-lot summary', () => {
    expect(locationSummary(fakeSim({ currentAction: 'Sleep(bed_1)' }), ctx))
      .toBe('in the kitchen, sleeping');
  });
  it('summarises off-lot states plainly', () => {
    expect(locationSummary(fakeSim({ _atWork: true }), ctx)).toBe('at work');
  });
});

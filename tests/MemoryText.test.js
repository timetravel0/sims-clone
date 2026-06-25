import { describe, it, expect } from 'vitest';
import { memoryText } from '../src/ui/MemoryLog.js';

// The singleton MemorySystem stores memories as { type, data } with no `description`,
// so the Life Events feed printed `Name: "undefined"`. memoryText derives a readable
// label from the shape and returns null when there's nothing to show. (2026-06-25)
describe('memoryText derives a label (no more "undefined")', () => {
  it('uses an explicit description when present', () => {
    expect(memoryText({ description: 'Achieved goal: Get fit' })).toBe('Achieved goal: Get fit');
  });
  it('builds a social label from type + data (the case that showed undefined)', () => {
    expect(memoryText({ type: 'social', data: { type: 'jealous_flirt', otherName: 'Dana' } }))
      .toBe('jealous flirt with Dana');
  });
  it('humanises an unknown type rather than emitting undefined', () => {
    expect(memoryText({ type: 'mood_peak', data: { tier: 'ecstatic' } })).toBe('felt ecstatic');
    expect(memoryText({ type: 'need_crisis', data: { need: 'hunger' } })).toBe('hunger crisis');
  });
  it('returns null when there is genuinely nothing to show', () => {
    expect(memoryText({ data: {} })).toBeNull();
  });
});

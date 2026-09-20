import { describe, expect, it } from 'vitest';
import { featuredResidentForDay, featuredResidentIndex, featuredStride } from '../featuredResident';

describe('featured resident of the day', () => {
  it('starts with the first resident and is stable for a given day', () => {
    const people = ['a', 'b', 'c', 'd', 'e'];
    expect(featuredResidentForDay(people, 1)).toBe('a');
    expect(featuredResidentForDay(people, 3)).toBe(featuredResidentForDay(people, 3));
  });

  it('changes every day', () => {
    for (const length of [2, 5, 10, 100]) {
      for (let day = 1; day < 60; day++) {
        expect(featuredResidentIndex(length, day)).not.toBe(featuredResidentIndex(length, day + 1));
      }
    }
  });

  it('features everyone exactly once before anyone repeats, then cycles', () => {
    for (const length of [1, 2, 3, 7, 12, 100]) {
      const seen = Array.from({ length }, (_, i) => featuredResidentIndex(length, i + 1));
      expect(new Set(seen).size).toBe(length);
      expect(featuredResidentIndex(length, length + 1)).toBe(featuredResidentIndex(length, 1));
    }
  });

  it('does not feature neighbors on consecutive days (roster is grouped by neighborhood)', () => {
    const a = featuredResidentIndex(100, 1), b = featuredResidentIndex(100, 2), c = featuredResidentIndex(100, 3);
    expect(Math.abs(a - b)).toBeGreaterThan(10);
    expect(Math.abs(b - c)).toBeGreaterThan(10);
  });

  it('always picks a stride coprime with the roster length', () => {
    for (let length = 3; length < 200; length++) {
      const stride = featuredStride(length);
      const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
      expect(gcd(stride, length)).toBe(1);
    }
  });

  it('handles an empty roster and out-of-range days', () => {
    expect(featuredResidentForDay([], 4)).toBeUndefined();
    expect(featuredResidentForDay(['a', 'b', 'c'], 0)).toBe('a');
    expect(featuredResidentForDay(['a', 'b', 'c'], -5)).toBe('a');
  });
});

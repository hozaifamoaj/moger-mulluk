import { describe, expect, it } from 'vitest';
import { Rng } from './rng';

describe('Rng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces a different sequence for a different seed', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('next() stays within [0, 1)', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const n = rng.next();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });

  it('range() stays within [min, max)', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const n = rng.range(10, 20);
      expect(n).toBeGreaterThanOrEqual(10);
      expect(n).toBeLessThan(20);
    }
  });

  it('int() stays within [min, max] inclusive', () => {
    const rng = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const n = rng.int(1, 3);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(3);
      seen.add(n);
    }
    expect(seen).toEqual(new Set([1, 2, 3]));
  });

  it('chance() returns true roughly p of the time', () => {
    const rng = new Rng(99);
    let trueCount = 0;
    const trials = 10000;
    for (let i = 0; i < trials; i++) {
      if (rng.chance(0.3)) trueCount++;
    }
    expect(trueCount / trials).toBeGreaterThan(0.25);
    expect(trueCount / trials).toBeLessThan(0.35);
  });

  it('pick() only returns elements from the array', () => {
    const rng = new Rng(5);
    const arr = ['a', 'b', 'c'];
    for (let i = 0; i < 100; i++) {
      expect(arr).toContain(rng.pick(arr));
    }
  });
});

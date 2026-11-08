import { afterEach, describe, expect, it } from 'vitest';
import {
  bestKey,
  computeUnlockedIds,
  getAllBests,
  getUnlockedIds,
  isUnlocked,
  persistUnlocks,
  totalStars,
  type BestResult,
} from '../src/vehicles';

function fakeStorage(overrides: Partial<Storage> = {}): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
    get length() {
      return data.size;
    },
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    ...overrides,
  } as Storage;
}

describe('vehicles', () => {
  afterEach(() => {
    globalThis.localStorage = fakeStorage();
  });

  it('bestKey namespaces the best-result storage key per vehicle', () => {
    expect(bestKey('car')).toBe('best.car');
    expect(bestKey('motorcycle')).toBe('best.motorcycle');
  });

  it('totalStars sums the best stars across vehicles, defaulting missing entries to 0', () => {
    const bests: Partial<Record<'car' | 'motorcycle', BestResult>> = {
      car: { score: 1000, stars: 2 },
    };
    expect(totalStars(bests)).toBe(2);
  });

  it('isUnlocked compares accumulated stars against the vehicle unlock threshold', () => {
    expect(isUnlocked('car', 0)).toBe(true);
    expect(isUnlocked('motorcycle', 0)).toBe(true);
  });

  it('computeUnlockedIds returns every vehicle whose threshold is met', () => {
    expect(computeUnlockedIds(0)).toEqual(expect.arrayContaining(['car', 'motorcycle']));
  });

  describe('getUnlockedIds / persistUnlocks', () => {
    it('falls back to a fresh computation when nothing has been persisted yet', () => {
      globalThis.localStorage = fakeStorage();
      expect(getUnlockedIds()).toEqual(computeUnlockedIds(0));
    });

    it('round-trips a persisted unlock list', () => {
      globalThis.localStorage = fakeStorage();
      persistUnlocks(0);
      expect(getUnlockedIds()).toEqual(computeUnlockedIds(0));
    });

    it('falls back to recomputation when the persisted value is corrupt', () => {
      const backing = fakeStorage();
      backing.setItem('mm.unlocks', '{not json');
      globalThis.localStorage = backing;
      expect(getUnlockedIds()).toEqual(computeUnlockedIds(totalStars(getAllBests())));
    });

    it('falls back to recomputation when the persisted value contains an unknown vehicle id', () => {
      const backing = fakeStorage();
      backing.setItem('mm.unlocks', JSON.stringify(['car', 'not-a-real-vehicle']));
      globalThis.localStorage = backing;
      expect(getUnlockedIds()).toEqual(computeUnlockedIds(totalStars(getAllBests())));
    });
  });

  describe('getAllBests', () => {
    it('returns an empty object when no bests are stored', () => {
      globalThis.localStorage = fakeStorage();
      expect(getAllBests()).toEqual({});
    });

    it('collects only the vehicles that have a stored best', () => {
      const backing = fakeStorage();
      backing.setItem('mm.best.car', JSON.stringify({ score: 500, stars: 1 }));
      globalThis.localStorage = backing;
      expect(getAllBests()).toEqual({ car: { score: 500, stars: 1 } });
    });
  });
});

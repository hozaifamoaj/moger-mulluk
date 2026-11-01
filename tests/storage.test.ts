import { afterEach, describe, expect, it } from 'vitest';
import { get, set } from '../src/storage';

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

describe('storage', () => {
  afterEach(() => {
    globalThis.localStorage = fakeStorage();
  });

  it('round-trips a value through the mm. prefix', () => {
    const backing = fakeStorage();
    globalThis.localStorage = backing;
    set('best', { score: 10 });
    expect(backing.getItem('mm.best')).toBe(JSON.stringify({ score: 10 }));
    expect(get('best', null)).toEqual({ score: 10 });
  });

  it('returns the fallback when the key is missing', () => {
    globalThis.localStorage = fakeStorage();
    expect(get('missing', 'fallback')).toBe('fallback');
  });

  it('returns the fallback when localStorage.getItem throws', () => {
    globalThis.localStorage = fakeStorage({
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(get('anything', 'fallback')).toBe('fallback');
  });

  it('returns the fallback when the stored value is invalid JSON', () => {
    const backing = fakeStorage();
    backing.setItem('mm.broken', '{not json');
    globalThis.localStorage = backing;
    expect(get('broken', 'fallback')).toBe('fallback');
  });

  it('does not throw when localStorage.setItem throws (storage full)', () => {
    globalThis.localStorage = fakeStorage({
      setItem: () => {
        throw new Error('quota exceeded');
      },
    });
    expect(() => set('best', { score: 1 })).not.toThrow();
  });
});

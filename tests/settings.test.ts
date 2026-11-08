import { afterEach, describe, expect, it } from 'vitest';
import { getSettings, setSettings } from '../src/settings';

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

describe('settings', () => {
  afterEach(() => {
    globalThis.localStorage = fakeStorage();
  });

  it('returns the default settings when nothing has been stored yet', () => {
    globalThis.localStorage = fakeStorage();
    expect(getSettings()).toEqual({ sound: true, language: 'en', nickname: null });
  });

  it('round-trips a stored settings object', () => {
    globalThis.localStorage = fakeStorage();
    setSettings({ sound: false, language: 'bn', nickname: 'Rafi' });
    expect(getSettings()).toEqual({ sound: false, language: 'bn', nickname: 'Rafi' });
  });

  it('falls back to defaults when the stored value is corrupt JSON', () => {
    const backing = fakeStorage();
    backing.setItem('mm.settings', '{not json');
    globalThis.localStorage = backing;
    expect(getSettings()).toEqual({ sound: true, language: 'en', nickname: null });
  });

  it('falls back to defaults when the stored value has the wrong shape', () => {
    const backing = fakeStorage();
    backing.setItem('mm.settings', JSON.stringify({ sound: 'yes', language: 'fr' }));
    globalThis.localStorage = backing;
    expect(getSettings()).toEqual({ sound: true, language: 'en', nickname: null });
  });
});

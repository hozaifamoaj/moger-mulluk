import { STORAGE_PREFIX } from './sim/config';

// §12.6 Saved data. Every call is wrapped in try/catch: the game must work
// when localStorage is empty, full or blocked.

export function get<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function set<T>(key: string, value: T): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage unavailable or full; the run continues without persistence.
  }
}

import * as storage from './storage';

export type Language = 'en' | 'bn';

// §12.6 mm.settings: nickname lives alongside sound/language (§10.2's
// Settings screen lists all three). `null` means "not chosen yet" —
// ResultsScene prompts for one the first time it's needed for a leaderboard
// submission, rather than blocking the menu at boot (CLAUDE.md rule 12:
// gameplay never waits on anything online-related).
export interface Settings {
  sound: boolean;
  language: Language;
  nickname: string | null;
}

const SETTINGS_KEY = 'settings';
const DEFAULT_SETTINGS: Settings = { sound: true, language: 'en', nickname: null };

function isValid(value: unknown): value is Settings {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.sound === 'boolean' &&
    (v.language === 'en' || v.language === 'bn') &&
    (v.nickname === null || typeof v.nickname === 'string')
  );
}

export function getSettings(): Settings {
  const stored = storage.get<unknown>(SETTINGS_KEY, DEFAULT_SETTINGS);
  return isValid(stored) ? stored : DEFAULT_SETTINGS;
}

export function setSettings(settings: Settings): void {
  storage.set<Settings>(SETTINGS_KEY, settings);
}

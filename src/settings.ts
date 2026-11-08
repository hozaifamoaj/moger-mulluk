import * as storage from './storage';

export type Language = 'en' | 'bn';

export interface Settings {
  sound: boolean;
  language: Language;
}

const SETTINGS_KEY = 'settings';
const DEFAULT_SETTINGS: Settings = { sound: true, language: 'en' };

function isValid(value: unknown): value is Settings {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.sound === 'boolean' && (v.language === 'en' || v.language === 'bn');
}

export function getSettings(): Settings {
  const stored = storage.get<unknown>(SETTINGS_KEY, DEFAULT_SETTINGS);
  return isValid(stored) ? stored : DEFAULT_SETTINGS;
}

export function setSettings(settings: Settings): void {
  storage.set<Settings>(SETTINGS_KEY, settings);
}

import type { Language } from '../settings';

// §10.2/§12.8: Bangla text renders through the "Nirmala UI" system font
// (ships with Windows; covers Bangla and Latin), falling back to the
// platform default sans-serif where it isn't installed. No webfont asset is
// bundled.
export const FONT_FAMILY = "'Nirmala UI', sans-serif";

const EN = {
  gameTitle: 'Moger-mulluk',
  play: 'Play',
  settings: 'Settings',
  controlsHint: 'W/↑ Gas   S/↓ Brake   A/D or ←/→ Steer   Space Horn',
  pause: 'Pause',
  paused: 'Paused',
  resume: 'Resume',
  restart: 'Restart',
  quitToMenu: 'Quit to menu',
  nearMiss: 'Near miss!',
  fine: 'Fine!',
  pedestrianHit: 'Pedestrian hit!',
  honk: 'Honk!',
  scoreLabel: 'Score',
  speedLabel: 'Speed',
  finish: 'Finish!',
  failTime: "Time's up",
  failWrecked: 'Your car is wrecked',
  failPedestrian: 'You hit a pedestrian',
  timeLabel: 'Time',
  nearMissesLabel: 'Near misses',
  collisionsLabel: 'Collisions',
  finesLabel: 'Fines',
  seedLabel: 'Seed',
  retry: 'Retry',
  menu: 'Menu',
  changeVehicle: 'Change vehicle',
  vehicleSelectTitle: 'Select vehicle',
  maxSpeedLabel: 'Max speed',
  accelerationLabel: 'Acceleration',
  steeringLabel: 'Steering',
  healthLabel: 'Health',
  locked: 'Locked',
  starsNeeded: 'stars needed',
  back: 'Back',
  soundLabel: 'Sound',
  languageLabel: 'Language',
  on: 'On',
  off: 'Off',
} as const;

const BN: Record<keyof typeof EN, string> = {
  gameTitle: 'মগের মুল্লুক',
  play: 'খেলুন',
  settings: 'সেটিংস',
  controlsHint: 'গ্যাস W/↑   ব্রেক S/↓   স্টিয়ার A/D বা ←/→   হর্ন Space',
  pause: 'পজ',
  paused: 'পজ করা হয়েছে',
  resume: 'আবার শুরু',
  restart: 'পুনরায় শুরু',
  quitToMenu: 'মেনুতে ফিরুন',
  nearMiss: 'নিয়ার মিস!',
  fine: 'জরিমানা!',
  pedestrianHit: 'পথচারীকে আঘাত!',
  honk: 'হর্ন!',
  scoreLabel: 'স্কোর',
  speedLabel: 'গতি',
  finish: 'সমাপ্ত!',
  failTime: 'সময় শেষ',
  failWrecked: 'আপনার গাড়ি বিধ্বস্ত হয়েছে',
  failPedestrian: 'আপনি একজন পথচারীকে আঘাত করেছেন',
  timeLabel: 'সময়',
  nearMissesLabel: 'নিয়ার মিস',
  collisionsLabel: 'সংঘর্ষ',
  finesLabel: 'জরিমানা',
  seedLabel: 'সীড',
  retry: 'আবার চেষ্টা',
  menu: 'মেনু',
  changeVehicle: 'গাড়ি পরিবর্তন',
  vehicleSelectTitle: 'গাড়ি বেছে নিন',
  maxSpeedLabel: 'সর্বোচ্চ গতি',
  accelerationLabel: 'ত্বরণ',
  steeringLabel: 'স্টিয়ারিং',
  healthLabel: 'স্বাস্থ্য',
  locked: 'লক করা',
  starsNeeded: 'স্টার প্রয়োজন',
  back: 'পেছনে',
  soundLabel: 'শব্দ',
  languageLabel: 'ভাষা',
  on: 'চালু',
  off: 'বন্ধ',
};

const STRINGS: Record<Language, Record<keyof typeof EN, string>> = { en: EN, bn: BN };

export type StringKey = keyof typeof EN;

export function t(key: StringKey, language: Language): string {
  return STRINGS[language][key];
}

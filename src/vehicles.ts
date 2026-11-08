import { UNLOCKS } from './sim/config';
import type { PlayableVehicleId } from './sim/types';
import * as storage from './storage';

// §12.6: one best result per vehicle.
export interface BestResult {
  score: number;
  stars: 0 | 1 | 2 | 3;
}

const VEHICLE_IDS = Object.keys(UNLOCKS) as PlayableVehicleId[];
const UNLOCKS_KEY = 'unlocks';

export function bestKey(vehicleId: PlayableVehicleId): string {
  return `best.${vehicleId}`;
}

// §9: "stars count each vehicle's best result only" — sum of the best stars
// ever achieved per vehicle, across all vehicles. Pure function so the
// unlock rule is testable without touching storage.
export function totalStars(bests: Partial<Record<PlayableVehicleId, BestResult>>): number {
  return VEHICLE_IDS.reduce((sum, id) => sum + (bests[id]?.stars ?? 0), 0);
}

// §9: a vehicle is unlocked once the player's total stars reach its threshold.
export function isUnlocked(vehicleId: PlayableVehicleId, stars: number): boolean {
  return stars >= UNLOCKS[vehicleId];
}

// Pure: every vehicle unlocked at a given total star count.
export function computeUnlockedIds(stars: number): PlayableVehicleId[] {
  return VEHICLE_IDS.filter((id) => isUnlocked(id, stars));
}

// Reads every vehicle's best result from storage; missing or corrupt entries
// are simply absent (rule 11: the game works with empty/corrupt storage).
export function getAllBests(): Partial<Record<PlayableVehicleId, BestResult>> {
  const bests: Partial<Record<PlayableVehicleId, BestResult>> = {};
  for (const id of VEHICLE_IDS) {
    const stored = storage.get<BestResult | null>(bestKey(id), null);
    if (stored !== null) bests[id] = stored;
  }
  return bests;
}

// §12.6 mm.unlocks: the unlocked vehicle list, persisted so VehicleSelect
// doesn't need to recompute it from every best-result key on every visit.
// Falls back to recomputing from mm.best if the stored list is missing or
// corrupt (rule 11).
export function getUnlockedIds(): PlayableVehicleId[] {
  const stored = storage.get<unknown>(UNLOCKS_KEY, null);
  if (Array.isArray(stored) && stored.every((id) => VEHICLE_IDS.includes(id))) {
    return stored as PlayableVehicleId[];
  }
  return computeUnlockedIds(totalStars(getAllBests()));
}

export function persistUnlocks(stars: number): void {
  storage.set<PlayableVehicleId[]>(UNLOCKS_KEY, computeUnlockedIds(stars));
}

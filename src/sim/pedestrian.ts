// §6 Pedestrians: spawn at crossing zones marked on the map, wait on the
// footpath for fair warning, then walk straight across (in x; y is fixed
// for a pedestrian's lifetime — a crossing is a fixed point on the road),
// sometimes pausing midway or crossing in pairs. Waiting bus-stop
// passengers are a separate static case: placed once by the map (see
// RouteMap.waitingPassengers), never transition out of `isWaitingPassenger`,
// and act only as obstacles/hit targets. Pool-friendly (CLAUDE.md rule 10):
// a fixed array of slots, mutated in place.
import type { PedestrianState } from './types';
import type { Rng } from './rng';
import type { CrossingZone, RouteMap } from './map';
import { HORN, PEDESTRIAN } from './config';
import { computeRoadEdges } from './road';

export function createPedestrianPool(): PedestrianState[] {
  return Array.from({ length: PEDESTRIAN.poolCapacity }, () => ({
    active: false,
    crossingIndex: -1,
    isWaitingPassenger: false,
    usesOverbridge: false,
    phase: 'waiting',
    x: 0,
    y: 0,
    startX: 0,
    targetX: 0,
    speed: 0,
    waitTimer: 0,
    midwayStopX: null,
    hasStoppedMidway: false,
    stopTimer: 0,
    speedBoostTimer: 0,
  }));
}

/** §6 "waiting passengers": placed once, deterministically, at Sim construction. */
export function placeWaitingPassengers(pool: PedestrianState[], map: RouteMap): void {
  let index = 0;
  for (const passenger of map.waitingPassengers) {
    while (index < pool.length && pool[index].active) index++;
    if (index >= pool.length) return; // pool exhausted; skip the rest

    const slot = pool[index];
    slot.active = true;
    slot.crossingIndex = -1;
    slot.isWaitingPassenger = true;
    slot.usesOverbridge = false;
    slot.phase = 'waiting';
    slot.x = passenger.x;
    slot.y = passenger.y;
    slot.startX = passenger.x;
    slot.targetX = passenger.x;
    slot.speed = 0;
    slot.waitTimer = Infinity;
    slot.midwayStopX = null;
    slot.hasStoppedMidway = false;
    slot.stopTimer = 0;
    slot.speedBoostTimer = 0;
    index++;
  }
}

/**
 * §6: advances every active, non-waiting-passenger pedestrian one fixed
 * step — the footpath wait, the walk across (with an optional midway
 * pause), and the horn speed boost's countdown. Deactivates a pedestrian
 * once it reaches the far side, returning its slot to the pool. Mutates
 * `pool` in place (rule 10).
 */
export function stepPedestrians(pool: PedestrianState[], dt: number): void {
  for (const ped of pool) {
    if (!ped.active || ped.isWaitingPassenger) continue;

    if (ped.speedBoostTimer > 0) ped.speedBoostTimer = Math.max(0, ped.speedBoostTimer - dt);

    if (ped.phase === 'waiting') {
      ped.waitTimer -= dt;
      if (ped.waitTimer > 0) continue;
      ped.phase = 'walking';
    } else if (ped.phase === 'stoppedMidway') {
      ped.stopTimer -= dt;
      if (ped.stopTimer > 0) continue;
      ped.phase = 'walking';
    }

    const direction: 1 | -1 = ped.targetX >= ped.startX ? 1 : -1;
    const effectiveSpeed = ped.speed * (ped.speedBoostTimer > 0 ? HORN.pedestrianSpeedBoostMultiplier : 1);
    const nextX = ped.x + direction * effectiveSpeed * dt;

    if (ped.midwayStopX !== null && !ped.hasStoppedMidway && crossed(ped.x, nextX, ped.midwayStopX, direction)) {
      ped.x = ped.midwayStopX;
      ped.hasStoppedMidway = true;
      ped.phase = 'stoppedMidway';
      ped.stopTimer = PEDESTRIAN.midwayStopDurationSeconds;
      continue;
    }

    if (crossed(ped.x, nextX, ped.targetX, direction)) {
      ped.active = false; // reached the far footpath; return to the pool
      continue;
    }

    ped.x = nextX;
  }
}

/** True if moving from `from` to `to` along `direction` passes `mark`. */
function crossed(from: number, to: number, mark: number, direction: 1 | -1): boolean {
  return direction > 0 ? from < mark && to >= mark : from > mark && to <= mark;
}

/**
 * §6: per-crossing-zone spawn timer (4-8s). Each spawn event rolls pair
 * (20%) and, when the zone has an overbridge, overbridge-use (50%) once for
 * the whole group; midway-stop (25%) and speed are rolled per pedestrian.
 * Skipped — not retried on a delay — when the zone's cap (3 on the road at
 * once, overbridge users excluded) is already full; `spawnTimers` stays at
 * or below zero so the next call tries again immediately. Mutates `pool`
 * and `spawnTimers` in place (rule 10).
 */
export function spawnPedestrians(
  pool: PedestrianState[],
  rng: Rng,
  map: RouteMap,
  spawnTimers: number[],
  dt: number,
): void {
  for (let zoneIndex = 0; zoneIndex < map.crossings.length; zoneIndex++) {
    spawnTimers[zoneIndex] -= dt;
    if (spawnTimers[zoneIndex] > 0) continue;

    const zone = map.crossings[zoneIndex];
    const usesOverbridge = zone.overbridge && rng.chance(PEDESTRIAN.overbridgeChance);
    const groupSize = rng.chance(PEDESTRIAN.pairChance) ? 2 : 1;

    if (!usesOverbridge) {
      const onRoad = pool.reduce(
        (n, p) =>
          n + (p.active && !p.isWaitingPassenger && !p.usesOverbridge && p.crossingIndex === zoneIndex ? 1 : 0),
        0,
      );
      if (onRoad + groupSize > PEDESTRIAN.maxPerZone) continue; // zone full; retry next call
    }

    const freeSlots = pool.filter((p) => !p.active);
    if (freeSlots.length < groupSize) continue; // pool exhausted; retry next call

    const startSide: -1 | 1 = rng.chance(0.5) ? -1 : 1;
    const edges = computeRoadEdges(map.laneCountAt(zone.y));
    const leftFootpathCenterX = (edges.roadLeftX + edges.footpathPlayerRightX) / 2;
    const rightFootpathCenterX = (edges.footpathOppositeLeftX + edges.roadRightX) / 2;
    const startX = startSide === -1 ? leftFootpathCenterX : rightFootpathCenterX;
    const targetX = startSide === -1 ? rightFootpathCenterX : leftFootpathCenterX;

    for (let i = 0; i < groupSize; i++) {
      activatePedestrian(freeSlots[i], zoneIndex, zone, startX, targetX, i, groupSize, rng, usesOverbridge);
    }

    spawnTimers[zoneIndex] = rng.range(PEDESTRIAN.spawnIntervalMin, PEDESTRIAN.spawnIntervalMax);
  }
}

function activatePedestrian(
  slot: PedestrianState,
  crossingIndex: number,
  zone: CrossingZone,
  startX: number,
  targetX: number,
  pairMemberIndex: number,
  groupSize: number,
  rng: Rng,
  usesOverbridge: boolean,
): void {
  const yOffset = groupSize === 2 ? (pairMemberIndex === 0 ? -PEDESTRIAN.pairYOffset : PEDESTRIAN.pairYOffset) : 0;

  slot.active = true;
  slot.crossingIndex = crossingIndex;
  slot.isWaitingPassenger = false;
  slot.usesOverbridge = usesOverbridge;
  slot.phase = 'waiting';
  slot.x = startX;
  slot.y = zone.y + yOffset;
  slot.startX = startX;
  slot.targetX = targetX;
  slot.speed = rng.range(PEDESTRIAN.speedMin, PEDESTRIAN.speedMax);
  slot.waitTimer = rng.range(PEDESTRIAN.minWarningSeconds, PEDESTRIAN.maxWarningSeconds);
  slot.hasStoppedMidway = false;
  slot.midwayStopX = rng.chance(PEDESTRIAN.midwayStopChance)
    ? startX + (targetX - startX) * rng.range(0.35, 0.65)
    : null;
  slot.stopTimer = 0;
  slot.speedBoostTimer = 0;
}

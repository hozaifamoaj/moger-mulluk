import type { TrafficVehicleState, TrafficVehicleConfig } from './types';
import type { Rng } from './rng';
import type { RouteMap, SpawnableTrafficType } from './map';
import {
  SPAWN,
  TRAFFIC,
  TRAFFIC_RULES,
  CAR_SIDEWAYS_SHIFT,
  CNG_CUTIN,
  RICKSHAW_CLUSTER,
  RICKSHAW_DRIFT,
  MOTORCYCLE_WEAVE,
  MOTORCYCLE_WRONG_WAY,
} from './config';
import { computeRoadEdges } from './road';

interface PlayerLike {
  x: number;
  y: number;
  width: number;
  length: number;
}

const SPAWN_ATTEMPTS = 20;

/** §5.1 rule 5: despawn once well behind the player, returning the slot to the pool. */
export function despawnBehindPlayer(traffic: TrafficVehicleState[], playerY: number): void {
  for (const vehicle of traffic) {
    if (vehicle.active && vehicle.y - playerY > SPAWN.behindPlayerDespawnDistance) {
      vehicle.active = false;
    }
  }
}

/**
 * §7.3: map-placed parked vehicles are activated once, deterministically
 * (no RNG), at Sim construction — before any RNG-driven spawning fills the
 * rest of the pool.
 */
export function placeParkedVehicles(traffic: TrafficVehicleState[], map: RouteMap): void {
  let index = 0;
  for (const parked of map.parkedVehicles) {
    while (index < traffic.length && traffic[index].active) index++;
    if (index >= traffic.length) return; // pool exhausted; skip the rest

    const slot = traffic[index];
    slot.active = true;
    slot.type = 'parked';
    slot.x = parked.x;
    slot.y = parked.y;
    slot.speed = 0;
    slot.cruiseSpeed = 0;
    slot.width = parked.width;
    slot.length = parked.length;
    slot.stopTimer = 0;
    slot.sidewaysShift = null;
    slot.drift = null;
    slot.direction = 1;
    slot.lastBusStopY = null;
    slot.nearMissGiven = false;
    index++;
  }
}

/**
 * §5.3: tops up the pool to the local segment's density target, spawning
 * just beyond the visible window ahead of the player so nothing pops into
 * view, using the seeded RNG for type (per the segment's spawn table),
 * lateral position and speed. §5.1 rule 4: retries on overlap; skips the
 * attempt this call if no clear spot is found within the attempt budget.
 */
export function spawnTraffic(traffic: TrafficVehicleState[], rng: Rng, player: PlayerLike, map: RouteMap): void {
  fillSlots(traffic, rng, player, map, () => player.y - rng.range(SPAWN.offscreenSpawnDistance, SPAWN.aheadOfPlayerDistance));
}

/**
 * Used once at Sim construction to spread the first batch across the whole
 * ahead-of-player window (not just off-screen), so the road isn't empty at
 * the start of a run.
 */
export function fillInitialTraffic(traffic: TrafficVehicleState[], rng: Rng, player: PlayerLike, map: RouteMap): void {
  fillSlots(traffic, rng, player, map, () => player.y - rng.range(0, SPAWN.aheadOfPlayerDistance));
}

function fillSlots(
  traffic: TrafficVehicleState[],
  rng: Rng,
  player: PlayerLike,
  map: RouteMap,
  pickY: () => number,
): void {
  const activeCount = traffic.reduce((n, v) => n + (v.active && v.type !== 'parked' ? 1 : 0), 0);
  let toSpawn = map.targetActiveCountAt(player.y) - activeCount;
  if (toSpawn <= 0) return;

  const freeSlots = traffic.filter((v) => !v.active);
  let slotIndex = 0;

  while (toSpawn > 0 && slotIndex < freeSlots.length) {
    const spawned = trySpawnGroup(freeSlots, slotIndex, traffic, rng, player, map, pickY);
    if (spawned > 0) {
      slotIndex += spawned;
      toSpawn -= spawned;
    } else {
      slotIndex += 1;
    }
  }
}

/**
 * Attempts to place one spawn "unit" starting at `freeSlots[startIndex]`: a
 * single vehicle for most types, or a rickshaw cluster (§5.2) consuming
 * several consecutive free slots. Returns how many slots were filled, or 0
 * if no clear space was found within the attempt budget.
 */
function trySpawnGroup(
  freeSlots: readonly TrafficVehicleState[],
  startIndex: number,
  traffic: readonly TrafficVehicleState[],
  rng: Rng,
  player: PlayerLike,
  map: RouteMap,
  pickY: () => number,
): number {
  for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt++) {
    const y = pickY();
    const type = pickType(map.spawnTableAt(y), rng);
    if (!type) continue;

    const clusterSize =
      type === 'rickshaw'
        ? Math.min(rng.int(RICKSHAW_CLUSTER.minSize, RICKSHAW_CLUSTER.maxSize), freeSlots.length - startIndex)
        : 1;
    if (clusterSize < 1) continue;

    const config = TRAFFIC[type];
    const edges = computeRoadEdges(map.laneCountAt(y));
    const minX = edges.footpathPlayerRightX + config.width / 2;
    const maxX = edges.dividerLeftX - config.width / 2;
    const baseX = rng.range(minX, maxX);

    const positions = Array.from({ length: clusterSize }, (_, i) => ({
      x: baseX,
      y: y + i * (config.length + RICKSHAW_CLUSTER.spacing),
    }));

    const blocked = positions.some((p) => overlapsAny(p.x, p.y, config.width, config.length, traffic, player));
    if (blocked) continue;

    const wrongWay = type === 'motorcycle' && map.wrongWayZoneAt(y);

    for (let i = 0; i < clusterSize; i++) {
      activateSlot(freeSlots[startIndex + i], type, positions[i].x, positions[i].y, config, rng, wrongWay);
    }
    return clusterSize;
  }

  return 0;
}

/** Weighted-by-count pick over a segment's spawn table; null if the table is empty. */
function pickType(
  table: readonly { type: SpawnableTrafficType; count: number }[],
  rng: Rng,
): SpawnableTrafficType | null {
  if (table.length === 0) return null;

  const total = table.reduce((sum, entry) => sum + entry.count, 0);
  let roll = rng.next() * total;
  for (const entry of table) {
    roll -= entry.count;
    if (roll <= 0) return entry.type;
  }
  return table[table.length - 1].type;
}

function activateSlot(
  slot: TrafficVehicleState,
  type: SpawnableTrafficType,
  x: number,
  y: number,
  config: TrafficVehicleConfig,
  rng: Rng,
  wrongWay: boolean,
): void {
  slot.active = true;
  slot.type = type;
  slot.x = x;
  slot.y = y;
  slot.width = config.width;
  slot.length = config.length;
  slot.stopTimer = 0;
  slot.nearMissGiven = false;
  slot.lastBusStopY = null;
  slot.direction = wrongWay ? -1 : 1;

  if (wrongWay) {
    slot.speed = MOTORCYCLE_WRONG_WAY.speed;
    slot.cruiseSpeed = MOTORCYCLE_WRONG_WAY.speed;
  } else {
    slot.speed = rng.range(config.speedMin, config.speedMax);
    slot.cruiseSpeed = slot.speed;
  }

  slot.drift =
    !wrongWay && (type === 'rickshaw' || type === 'motorcycle')
      ? { baseX: x, phase: rng.range(0, type === 'rickshaw' ? RICKSHAW_DRIFT.period : MOTORCYCLE_WEAVE.period) }
      : null;

  slot.sidewaysShift =
    type === 'car'
      ? {
          remainingTriggerDistance: rng.range(
            CAR_SIDEWAYS_SHIFT.minTriggerDistance,
            CAR_SIDEWAYS_SHIFT.maxTriggerDistance,
          ),
          magnitude: rng.range(CAR_SIDEWAYS_SHIFT.minMagnitude, CAR_SIDEWAYS_SHIFT.maxMagnitude),
          side: rng.chance(0.5) ? 1 : -1,
          progress: 0,
          speed: TRAFFIC_RULES.sidewaysMoveSpeed,
        }
      : type === 'cng'
        ? {
            // Side/magnitude are placeholders: §5.2 CNG cut-in resolves the
            // real gap at trigger time (see traffic.ts's pickClearGap).
            remainingTriggerDistance: rng.range(CNG_CUTIN.minTriggerDistance, CNG_CUTIN.maxTriggerDistance),
            magnitude: 0,
            side: 1,
            progress: 0,
            speed: TRAFFIC_RULES.sidewaysMoveSpeed,
          }
        : null;
}

// §5.1 rule 4: never overlap another traffic vehicle when spawning. A small
// buffer (the keep-distance gap) avoids an immediate hard speed-match clamp
// on the very next step.
function overlapsAny(
  x: number,
  y: number,
  width: number,
  length: number,
  traffic: readonly TrafficVehicleState[],
  player: PlayerLike,
): boolean {
  const buffer = TRAFFIC_RULES.keepDistanceGap;
  const overlaps = (ox: number, oy: number, ow: number, ol: number): boolean =>
    Math.abs(x - ox) < width / 2 + ow / 2 + buffer && Math.abs(y - oy) < length / 2 + ol / 2 + buffer;

  if (overlaps(player.x, player.y, player.width, player.length)) return true;

  for (const other of traffic) {
    if (!other.active) continue;
    if (overlaps(other.x, other.y, other.width, other.length)) return true;
  }

  return false;
}

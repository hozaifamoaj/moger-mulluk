import type { TrafficVehicleState, TrafficVehicleType } from './types';
import type { Rng } from './rng';
import { SPAWN, TRAFFIC, TRAFFIC_RULES, CAR_SIDEWAYS_SHIFT } from './config';
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
 * §5.3: tops up the pool to the density target, spawning just beyond the
 * visible window ahead of the player so nothing pops into view, using the
 * seeded RNG for type, speed, lateral position and (cars only) a sideways-
 * shift placeholder. §5.1 rule 4: retries on overlap; skips the slot this
 * call if no clear spot is found within the attempt budget.
 */
export function spawnTraffic(traffic: TrafficVehicleState[], rng: Rng, player: PlayerLike): void {
  const activeCount = traffic.reduce((n, v) => n + (v.active ? 1 : 0), 0);
  let toSpawn = SPAWN.targetActiveCount - activeCount;
  if (toSpawn <= 0) return;

  for (const slot of traffic) {
    if (toSpawn <= 0) break;
    if (slot.active) continue;

    const spawned = trySpawnOne(slot, traffic, rng, player, () =>
      player.y - rng.range(SPAWN.offscreenSpawnDistance, SPAWN.aheadOfPlayerDistance),
    );
    if (spawned) toSpawn--;
  }
}

/**
 * Used once at Sim construction to spread the first batch across the whole
 * ahead-of-player window (not just off-screen), so the road isn't empty at
 * the start of a run.
 */
export function fillInitialTraffic(traffic: TrafficVehicleState[], rng: Rng, player: PlayerLike): void {
  let toSpawn = SPAWN.targetActiveCount;

  for (const slot of traffic) {
    if (toSpawn <= 0) break;
    if (slot.active) continue;

    const spawned = trySpawnOne(slot, traffic, rng, player, () => player.y - rng.range(0, SPAWN.aheadOfPlayerDistance));
    if (spawned) toSpawn--;
  }
}

function trySpawnOne(
  slot: TrafficVehicleState,
  traffic: readonly TrafficVehicleState[],
  rng: Rng,
  player: PlayerLike,
  pickY: () => number,
): boolean {
  const edges = computeRoadEdges();
  const type: TrafficVehicleType = rng.chance(SPAWN.carRatio) ? 'car' : 'bus';
  const config = TRAFFIC[type];

  for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt++) {
    const y = pickY();
    const minX = edges.footpathPlayerRightX + config.width / 2;
    const maxX = edges.dividerLeftX - config.width / 2;
    const x = rng.range(minX, maxX);

    if (!overlapsAny(x, y, config.width, config.length, traffic, player)) {
      slot.active = true;
      slot.type = type;
      slot.x = x;
      slot.y = y;
      slot.speed = rng.range(config.speedMin, config.speedMax);
      slot.cruiseSpeed = slot.speed;
      slot.width = config.width;
      slot.length = config.length;
      slot.stopTimer = 0;
      slot.nearMissGiven = false;
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
            }
          : null;
      return true;
    }
  }

  return false;
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

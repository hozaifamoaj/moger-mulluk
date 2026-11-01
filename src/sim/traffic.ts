import type { TrafficVehicleState } from './types';
import type { RouteMap } from './map';
import type { Rng } from './rng';
import { SPAWN, TRAFFIC_RULES, JAM, BUS_STOP, RICKSHAW_DRIFT, MOTORCYCLE_WEAVE, CNG_CUTIN } from './config';

/** A fixed-size pool of inactive slots; the spawner activates/reuses them (CLAUDE.md rule 10). */
export function createTrafficPool(): TrafficVehicleState[] {
  return Array.from({ length: SPAWN.poolCapacity }, () => ({
    active: false,
    type: 'car',
    x: 0,
    y: 0,
    speed: 0,
    cruiseSpeed: 0,
    width: 0,
    length: 0,
    stopTimer: 0,
    sidewaysShift: null,
    drift: null,
    direction: 1 as const,
    lastBusStopY: null,
    nearMissGiven: false,
  }));
}

interface Obstacle {
  x: number;
  y: number;
  width: number;
  length: number;
  speed: number;
}

// §5.1 rule 2: look 120px ahead of the front bumper, within the vehicle's
// own width; match the obstacle's speed (decelerating at up to 400 px/s²)
// and keep a 30px gap, stopping if the obstacle is stopped.
function findAheadObstacle(vehicle: TrafficVehicleState, candidates: readonly Obstacle[]): Obstacle | null {
  let nearest: Obstacle | null = null;
  let nearestGap = Infinity;

  for (const candidate of candidates) {
    if (candidate.y >= vehicle.y) continue; // not ahead (smaller y = ahead, toward -y)

    const lateralOverlap = Math.abs(candidate.x - vehicle.x) < vehicle.width / 2 + candidate.width / 2;
    if (!lateralOverlap) continue;

    const gap = vehicle.y - vehicle.length / 2 - (candidate.y + candidate.length / 2);
    if (gap > TRAFFIC_RULES.keepDistanceLookAhead) continue;

    if (gap < nearestGap) {
      nearestGap = gap;
      nearest = candidate;
    }
  }

  return nearest;
}

function approach(current: number, target: number, maxDelta: number): number {
  const diff = target - current;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

/**
 * §5.1 / §5.2: advances every active traffic vehicle one fixed step —
 * keep-distance against whatever is ahead (traffic or the player), forward
 * movement, the car/CNG sideways shift, rickshaw/motorcycle drift, the jam
 * speed cap, and bus-stop dwell. Mutates `traffic` in place (rule 10: no
 * hot-path allocation for pooled entities).
 *
 * `traffic` must already be processed in ascending-y order by the caller so
 * that "ahead" neighbours have already been finalised this step. Wrong-way
 * motorcycles (direction === -1) are a deliberate exception: per the
 * architecture note in docs/progress.md, they move in a straight line
 * toward the player and are never added to `alreadyMoved`, so they don't
 * disturb that ascending-y invariant and other traffic doesn't react to
 * them (no AI, rule 9 — only the player's own collision check sees them).
 */
export function stepTraffic(
  traffic: TrafficVehicleState[],
  sortedAscendingByY: number[], // indices into `traffic`, ahead-first
  player: Obstacle,
  dt: number,
  map: RouteMap,
  rng: Rng,
): void {
  const alreadyMoved: Obstacle[] = [];
  const maxDelta = TRAFFIC_RULES.keepDistanceMaxDecel * dt;

  for (const index of sortedAscendingByY) {
    const vehicle = traffic[index];

    if (vehicle.stopTimer > 0) {
      vehicle.stopTimer = Math.max(0, vehicle.stopTimer - dt);
      vehicle.speed = 0;
      if (vehicle.direction === 1) alreadyMoved.push(vehicle);
      continue;
    }

    if (vehicle.direction === -1) {
      vehicle.speed = approach(vehicle.speed, vehicle.cruiseSpeed, maxDelta);
      vehicle.y += vehicle.speed * dt;
      continue;
    }

    const candidates: Obstacle[] = [...alreadyMoved, player];
    const ahead = findAheadObstacle(vehicle, candidates);

    const jamCappedTarget = map.jamSpeedCapAt(vehicle.y)
      ? Math.min(vehicle.cruiseSpeed, JAM.speedCap)
      : vehicle.cruiseSpeed;
    vehicle.speed = ahead
      ? approach(vehicle.speed, Math.max(ahead.speed, 0), maxDelta)
      : approach(vehicle.speed, jamCappedTarget, maxDelta);

    let newY = vehicle.y - vehicle.speed * dt;

    if (ahead) {
      const minFrontBumperY = ahead.y + ahead.length / 2 + TRAFFIC_RULES.keepDistanceGap + vehicle.length / 2;
      if (newY < minFrontBumperY) {
        newY = minFrontBumperY;
        vehicle.speed = Math.max(0, (vehicle.y - newY) / dt);
      }
    }

    vehicle.y = newY;
    applyDrift(vehicle, dt);
    applySidewaysShift(vehicle, traffic, player, dt);
    maybeTriggerBusStop(vehicle, map, rng);

    alreadyMoved.push(vehicle);
  }
}

// §5.2: rickshaw ±12px/3s wave, motorcycle weave — a continuous sine drift
// around a fixed base x, independent of the one-shot sideways shift below.
function applyDrift(vehicle: TrafficVehicleState, dt: number): void {
  const drift = vehicle.drift;
  if (!drift) return;

  drift.phase += dt;
  const config = vehicle.type === 'rickshaw' ? RICKSHAW_DRIFT : MOTORCYCLE_WEAVE;
  vehicle.x = drift.baseX + config.amplitude * Math.sin((2 * Math.PI * drift.phase) / config.period);
}

function applySidewaysShift(
  vehicle: TrafficVehicleState,
  traffic: readonly TrafficVehicleState[],
  player: Obstacle,
  dt: number,
): void {
  const shift = vehicle.sidewaysShift;
  if (!shift) return;

  if (shift.progress === 0) {
    shift.remainingTriggerDistance -= Math.abs(vehicle.speed) * dt;
    if (shift.remainingTriggerDistance > 0) return;

    if (vehicle.type === 'cng') {
      // §5.2: CNG cuts into the nearest clear gap, rather than a pre-rolled one.
      const gap = pickClearGap(vehicle, CNG_CUTIN.offsets, traffic, player);
      if (!gap) {
        vehicle.sidewaysShift = null;
        return;
      }
      shift.side = gap.side;
      shift.magnitude = gap.magnitude;
    } else if (!clearForShift(vehicle, shift.side, shift.magnitude, traffic, player)) {
      vehicle.sidewaysShift = null; // §5.1 rule 3: skipped, not retried, when blocked
      return;
    }
  }

  const remaining = shift.magnitude - shift.progress;
  const move = Math.min(remaining, TRAFFIC_RULES.sidewaysMoveSpeed * dt);
  vehicle.x += shift.side * move;
  shift.progress += move;

  if (shift.progress >= shift.magnitude) {
    vehicle.sidewaysShift = null;
  }
}

function pickClearGap(
  vehicle: TrafficVehicleState,
  offsets: readonly number[],
  traffic: readonly TrafficVehicleState[],
  player: Obstacle,
): { side: -1 | 1; magnitude: number } | null {
  for (const offset of offsets) {
    const side: -1 | 1 = offset < 0 ? -1 : 1;
    const magnitude = Math.abs(offset);
    if (clearForShift(vehicle, side, magnitude, traffic, player)) {
      return { side, magnitude };
    }
  }
  return null;
}

// §5.1 rule 3: the target space must be clear for the vehicle's length plus
// 30px front and back.
function clearForShift(
  vehicle: TrafficVehicleState,
  side: -1 | 1,
  magnitude: number,
  traffic: readonly TrafficVehicleState[],
  player: Obstacle,
): boolean {
  const targetX = vehicle.x + side * magnitude;
  const requiredHalfLength = vehicle.length / 2 + TRAFFIC_RULES.sidewaysClearanceMargin;
  const minY = vehicle.y - requiredHalfLength;
  const maxY = vehicle.y + requiredHalfLength;

  const blocks = (other: Obstacle): boolean => {
    const lateralOverlap = Math.abs(other.x - targetX) < vehicle.width / 2 + other.width / 2;
    if (!lateralOverlap) return false;
    const otherMinY = other.y - other.length / 2;
    const otherMaxY = other.y + other.length / 2;
    return otherMinY < maxY && otherMaxY > minY;
  };

  if (blocks(player)) return false;

  for (const other of traffic) {
    if (other === vehicle || !other.active) continue;
    if (blocks(other)) return false;
  }

  return true;
}

// §5.2/§5.4: buses dwell 3–6s the first time they reach a bus-stop zone.
// `lastBusStopY` prevents re-triggering every step the bus is stopped there.
function maybeTriggerBusStop(vehicle: TrafficVehicleState, map: RouteMap, rng: Rng): void {
  if (vehicle.type !== 'bus') return;

  for (const stopY of map.busStops) {
    if (vehicle.lastBusStopY === stopY) continue;
    if (vehicle.y <= stopY) {
      vehicle.stopTimer = rng.range(BUS_STOP.minDwellSeconds, BUS_STOP.maxDwellSeconds);
      vehicle.lastBusStopY = stopY;
      return;
    }
  }
}

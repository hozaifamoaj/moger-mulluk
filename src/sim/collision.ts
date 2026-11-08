import type {
  CollisionClass,
  FineReason,
  PedestrianState,
  PlayerVehicleState,
  SimEvent,
  TrafficVehicleState,
  VehicleConfig,
} from './types';
import type { RouteMap } from './map';
import { COLLISION, NEAR_MISS, PEDESTRIAN, VEHICLE_COLLISION } from './config';
import { computeRoadEdges } from './road';
import { circleOverlapsRect, satOverlap, satOverlapInflated, type RotatedRect } from './sat';

/**
 * §8 / §8.1: kerb and divider contact for the player car. The car cannot
 * mount the kerb on either side (an unconditional wall at both footpath
 * edges), and the divider is a solid wall except where the map marks a
 * dividerGap (§7.3) — inside a gap the car may cross onto the wrong side.
 * Contact response, per §8.1, for "any vehicle at the kerb/divider outside a
 * gap": pushed back onto the road, loses 50% of speed, and loses health only
 * if speed was above 30% of top speed, gated by a shared 0.5s cooldown.
 *
 * Pure function: takes the vehicle state after movement, returns the
 * corrected state plus any events that happened this step.
 */
export function resolveRoadContact(
  state: PlayerVehicleState,
  config: VehicleConfig,
  dt: number,
  map: RouteMap,
): { state: PlayerVehicleState; events: SimEvent[] } {
  const edges = computeRoadEdges(map.laneCountAt(state.y));
  const events: SimEvent[] = [];

  const halfWidth = config.width / 2;
  const halfLength = config.length / 2;
  const halfExtentX = Math.abs(halfWidth * Math.cos(state.heading)) + Math.abs(halfLength * Math.sin(state.heading));

  let x = state.x;
  let speed = state.speed;
  let health = state.health;
  let kerbCooldown = Math.max(0, state.kerbCooldown - dt);

  if (!config.footpathAllowed) {
    const carLeft = x - halfExtentX;
    if (carLeft < edges.footpathPlayerRightX) {
      const preContactSpeed = speed;
      x += edges.footpathPlayerRightX - carLeft;
      speed *= COLLISION.kerbSpeedMultiplier;
      const result = applyContactDamage('kerbContact', preContactSpeed, config, health, kerbCooldown, events);
      health = result.health;
      kerbCooldown = result.kerbCooldown;
    }
  }

  if (!map.dividerGapAt(state.y)) {
    const carRight = x + halfExtentX;
    if (carRight > edges.dividerLeftX) {
      const preContactSpeed = speed;
      x -= carRight - edges.dividerLeftX;
      speed *= COLLISION.kerbSpeedMultiplier;
      const result = applyContactDamage('dividerContact', preContactSpeed, config, health, kerbCooldown, events);
      health = result.health;
      kerbCooldown = result.kerbCooldown;
    }
  }

  if (!config.footpathAllowed) {
    const carRightEdge = x + halfExtentX;
    if (carRightEdge > edges.footpathOppositeLeftX) {
      const preContactSpeed = speed;
      x -= carRightEdge - edges.footpathOppositeLeftX;
      speed *= COLLISION.kerbSpeedMultiplier;
      const result = applyContactDamage('kerbContact', preContactSpeed, config, health, kerbCooldown, events);
      health = result.health;
      kerbCooldown = result.kerbCooldown;
    }
  }

  return { state: { ...state, x, speed, health, kerbCooldown }, events };
}

/**
 * §3.4 / §9: inside a police zone, being on the footpath or the wrong side
 * of the divider costs a fine. Debounced via `PlayerVehicleState.fineActive`
 * so the event fires once on entry into the violation, not every step it
 * holds. Scoring (the −100 point cost) arrives with the scoring system; this
 * only emits the event.
 */
export function detectFine(
  player: PlayerVehicleState,
  config: VehicleConfig,
  map: RouteMap,
): { fineActive: boolean; events: SimEvent[] } {
  const edges = computeRoadEdges(map.laneCountAt(player.y));
  const halfWidth = config.width / 2;
  const halfLength = config.length / 2;
  const halfExtentX = Math.abs(halfWidth * Math.cos(player.heading)) + Math.abs(halfLength * Math.sin(player.heading));

  const onFootpath = player.x - halfExtentX < edges.footpathPlayerRightX;
  const onWrongSide = player.x + halfExtentX > edges.dividerLeftX;
  const violating = (onFootpath || onWrongSide) && map.policeZoneAt(player.y);

  const events: SimEvent[] = [];
  if (violating && !player.fineActive) {
    const fineReason: FineReason = onFootpath ? 'footpath' : 'wrongSide';
    events.push({ type: 'fine', healthLost: 0, fineReason });
  }

  return { fineActive: violating, events };
}

function applyContactDamage(
  type: 'kerbContact' | 'dividerContact',
  preContactSpeed: number,
  config: VehicleConfig,
  health: number,
  kerbCooldown: number,
  events: SimEvent[],
): { health: number; kerbCooldown: number } {
  const aboveThreshold = Math.abs(preContactSpeed) > COLLISION.kerbHealthSpeedThreshold * config.maxSpeed;
  const offCooldown = kerbCooldown <= 0;

  if (aboveThreshold && offCooldown) {
    events.push({ type, healthLost: COLLISION.kerbHealthLoss });
    return { health: health - COLLISION.kerbHealthLoss, kerbCooldown: COLLISION.kerbCooldownSeconds };
  }

  events.push({ type, healthLost: 0 });
  return { health, kerbCooldown };
}

function trafficRect(vehicle: TrafficVehicleState): RotatedRect {
  return { x: vehicle.x, y: vehicle.y, halfWidth: vehicle.width / 2, halfLength: vehicle.length / 2, heading: 0 };
}

function classify(relativeSpeed: number): CollisionClass {
  if (relativeSpeed < VEHICLE_COLLISION.scrapeSpeedThreshold) return 'scrape';
  if (relativeSpeed > VEHICLE_COLLISION.highSpeedThreshold) return 'highSpeed';
  return 'collision';
}

function healthLossFor(collisionClass: CollisionClass): number {
  if (collisionClass === 'scrape') return VEHICLE_COLLISION.scrapeHealthLoss;
  if (collisionClass === 'highSpeed') return VEHICLE_COLLISION.highSpeedHealthLoss;
  return VEHICLE_COLLISION.collisionHealthLoss;
}

function speedMultiplierFor(collisionClass: CollisionClass): number {
  return collisionClass === 'scrape'
    ? VEHICLE_COLLISION.scrapeSpeedMultiplier
    : VEHICLE_COLLISION.collisionSpeedMultiplier;
}

// Broad phase: only traffic within this generous y-margin of the player is
// worth a SAT test (covers the longest traffic vehicle's half-length plus
// the near-miss band). Exact SAT, not Phaser Arcade physics, per §8.
const COLLISION_SCAN_MARGIN = 150 + NEAR_MISS.distance;

/**
 * §8 / §8.1: player-vs-traffic collision. Traffic has no health in the
 * spec, and traffic-vs-traffic overlap is prevented by the §5.1
 * keep-distance rule rather than SAT, so only the player is checked here.
 * Mutates the hit traffic vehicle's `stopTimer` in place (rule 10).
 */
export function resolveVehicleCollisions(
  player: PlayerVehicleState,
  traffic: TrafficVehicleState[],
  invulnerability: number,
  config: VehicleConfig,
  dt: number,
): { state: PlayerVehicleState; invulnerability: number; events: SimEvent[] } {
  const events: SimEvent[] = [];
  let x = player.x;
  let y = player.y;
  let speed = player.speed;
  let health = player.health;
  let remainingInvuln = Math.max(0, invulnerability - dt);

  for (let i = 0; i < traffic.length; i++) {
    const vehicle = traffic[i];
    if (!vehicle.active) continue;
    if (Math.abs(vehicle.y - y) > config.length / 2 + vehicle.length / 2 + COLLISION_SCAN_MARGIN) continue;

    const rect: RotatedRect = { x, y, halfWidth: config.width / 2, halfLength: config.length / 2, heading: player.heading };
    const result = satOverlap(rect, trafficRect(vehicle));
    if (!result.overlap) continue;

    x += result.mtv.x;
    y += result.mtv.y;

    if (remainingInvuln > 0) {
      // §8.1 rule 4: still pushed apart, but no further health/point cost.
      events.push({ type: 'vehicleCollision', healthLost: 0, trafficId: i });
      continue;
    }

    const playerVelX = Math.sin(player.heading) * speed;
    const playerVelY = -Math.cos(player.heading) * speed;
    const relativeSpeed = Math.hypot(playerVelX, playerVelY + vehicle.speed);
    const collisionClass = classify(relativeSpeed);
    const healthLost = healthLossFor(collisionClass);

    health = Math.max(0, health - healthLost);
    speed *= speedMultiplierFor(collisionClass);
    vehicle.stopTimer = VEHICLE_COLLISION.hitVehiclePauseSeconds;
    remainingInvuln = VEHICLE_COLLISION.invulnerabilitySeconds;

    events.push({ type: 'vehicleCollision', healthLost, collisionClass, trafficId: i });
  }

  return { state: { ...player, x, y, speed, health }, invulnerability: remainingInvuln, events };
}

/**
 * §8 near miss: passing within 12px of a traffic vehicle at more than 60%
 * of the player's own top speed, without touching it. Reuses `satOverlap`
 * on inflated rectangles rather than closest-point geometry. Each traffic
 * vehicle gives at most one, for at most NEAR_MISS.cap per run. Mutates
 * `vehicle.nearMissGiven` in place (rule 10).
 */
export function detectNearMisses(
  player: PlayerVehicleState,
  traffic: TrafficVehicleState[],
  config: VehicleConfig,
  nearMissCount: number,
): { nearMissCount: number; events: SimEvent[] } {
  const events: SimEvent[] = [];
  let count = nearMissCount;

  if (count >= NEAR_MISS.cap) return { nearMissCount: count, events };
  if (Math.abs(player.speed) <= NEAR_MISS.speedThreshold * config.maxSpeed) return { nearMissCount: count, events };

  const rect: RotatedRect = {
    x: player.x,
    y: player.y,
    halfWidth: config.width / 2,
    halfLength: config.length / 2,
    heading: player.heading,
  };

  for (let i = 0; i < traffic.length; i++) {
    if (count >= NEAR_MISS.cap) break;

    const vehicle = traffic[i];
    if (!vehicle.active || vehicle.nearMissGiven) continue;
    if (Math.abs(vehicle.y - player.y) > config.length / 2 + vehicle.length / 2 + COLLISION_SCAN_MARGIN) continue;

    const other = trafficRect(vehicle);
    if (satOverlap(rect, other).overlap) continue; // touching: not a near miss
    if (!satOverlapInflated(rect, other, NEAR_MISS.distance)) continue;

    vehicle.nearMissGiven = true;
    count++;
    events.push({ type: 'nearMiss', healthLost: 0, trafficId: i });
  }

  return { nearMissCount: count, events };
}

/**
 * §3.1 / §6 / §8: touching a pedestrian (circle) with the player's car
 * (rotated rectangle) is an instant fail. Deactivates the hit pedestrian so
 * the event fires once per contact, not every step the overlap continues —
 * stopping the run itself (timer, Results screen) is M6's job; this only
 * emits the event. Mutates `pedestrians` in place (rule 10).
 */
export function detectPedestrianHit(
  player: PlayerVehicleState,
  pedestrians: PedestrianState[],
  config: VehicleConfig,
): { events: SimEvent[] } {
  const events: SimEvent[] = [];
  const rect: RotatedRect = {
    x: player.x,
    y: player.y,
    halfWidth: config.width / 2,
    halfLength: config.length / 2,
    heading: player.heading,
  };

  const scanMargin = config.length / 2 + PEDESTRIAN.radius + 50;
  for (let i = 0; i < pedestrians.length; i++) {
    const ped = pedestrians[i];
    if (!ped.active || ped.usesOverbridge) continue;
    if (Math.abs(ped.y - player.y) > scanMargin) continue;

    if (circleOverlapsRect({ x: ped.x, y: ped.y, radius: PEDESTRIAN.radius }, rect)) {
      ped.active = false;
      events.push({ type: 'pedestrianHit', healthLost: 0, pedestrianId: i });
    }
  }

  return { events };
}

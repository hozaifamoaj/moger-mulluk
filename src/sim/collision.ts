import type { PlayerVehicleState, SimEvent, VehicleConfig } from './types';
import { COLLISION } from './config';
import { computeRoadEdges } from './road';

/**
 * §8 / §8.1: kerb and divider contact for the player car. The car cannot
 * mount the kerb, and — since dividerGap map data doesn't exist until M4 —
 * the divider is treated as a solid wall for now, using the same response
 * rule §8.1 specifies for "any vehicle at the divider outside a gap":
 * pushed back onto the road, loses 50% of speed, and loses health only if
 * speed was above 30% of top speed, gated by a shared 0.5s cooldown.
 *
 * Pure function: takes the vehicle state after movement, returns the
 * corrected state plus any events that happened this step.
 */
export function resolveRoadContact(
  state: PlayerVehicleState,
  config: VehicleConfig,
  dt: number,
): { state: PlayerVehicleState; events: SimEvent[] } {
  const edges = computeRoadEdges();
  const events: SimEvent[] = [];

  const halfWidth = config.width / 2;
  const halfLength = config.length / 2;
  const halfExtentX = Math.abs(halfWidth * Math.cos(state.heading)) + Math.abs(halfLength * Math.sin(state.heading));

  let x = state.x;
  let speed = state.speed;
  let health = state.health;
  let kerbCooldown = Math.max(0, state.kerbCooldown - dt);

  const carLeft = x - halfExtentX;
  if (carLeft < edges.footpathPlayerRightX) {
    const preContactSpeed = speed;
    x += edges.footpathPlayerRightX - carLeft;
    speed *= COLLISION.kerbSpeedMultiplier;
    const result = applyContactDamage('kerbContact', preContactSpeed, config, health, kerbCooldown, events);
    health = result.health;
    kerbCooldown = result.kerbCooldown;
  }

  const carRight = x + halfExtentX;
  if (carRight > edges.dividerLeftX) {
    const preContactSpeed = speed;
    x -= carRight - edges.dividerLeftX;
    speed *= COLLISION.kerbSpeedMultiplier;
    const result = applyContactDamage('dividerContact', preContactSpeed, config, health, kerbCooldown, events);
    health = result.health;
    kerbCooldown = result.kerbCooldown;
  }

  return { state: { ...state, x, speed, health, kerbCooldown }, events };
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

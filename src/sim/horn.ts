// §3.3 Horn: affects anything inside a zone ahead of the player, with a
// cooldown so it can't be held down to clear the road. The zone is
// axis-aligned to the world rather than rotated with the player's heading —
// the spec describes a plain box, and the player is rarely at a steep angle
// in practice.
import type { Input, PedestrianState, SimEvent, TrafficVehicleState } from './types';
import type { RouteMap } from './map';
import { HORN } from './config';
import { computeRoadEdges } from './road';

interface PlayerLike {
  x: number;
  y: number;
}

/**
 * Ticks the horn cooldown down every step regardless of input. On a fresh
 * press with the cooldown elapsed, applies §3.3's three reactions to
 * whatever is inside the zone and resets the cooldown. Mutates `traffic`
 * and `pedestrians` in place (rule 10); returns the new cooldown and any
 * events (for presentation feedback/audio).
 */
export function stepHorn(
  input: Input,
  hornCooldown: number,
  player: PlayerLike,
  traffic: TrafficVehicleState[],
  pedestrians: PedestrianState[],
  map: RouteMap,
  dt: number,
): { hornCooldown: number; events: SimEvent[] } {
  const cooldown = Math.max(0, hornCooldown - dt);

  if (!input.horn || cooldown > 0) {
    return { hornCooldown: cooldown, events: [] };
  }

  const zoneMinY = player.y - HORN.aheadDistance;
  const zoneMaxY = player.y;
  const zoneMinX = player.x - HORN.width / 2;
  const zoneMaxX = player.x + HORN.width / 2;
  const inZone = (x: number, y: number): boolean => x >= zoneMinX && x <= zoneMaxX && y >= zoneMinY && y <= zoneMaxY;

  for (const vehicle of traffic) {
    if (!vehicle.active || vehicle.type !== 'rickshaw' || vehicle.sidewaysShift) continue;
    if (!inZone(vehicle.x, vehicle.y)) continue;

    const edges = computeRoadEdges(map.laneCountAt(vehicle.y));
    const roadCenterX = (edges.footpathPlayerRightX + edges.dividerLeftX) / 2;
    const side: -1 | 1 = vehicle.x < roadCenterX ? -1 : 1; // toward the nearer kerb

    vehicle.sidewaysShift = {
      remainingTriggerDistance: 0,
      magnitude: HORN.rickshawShiftMagnitude,
      side,
      progress: 0,
      speed: HORN.rickshawShiftMagnitude / HORN.rickshawShiftDurationSeconds,
    };
  }

  for (const ped of pedestrians) {
    if (!ped.active || ped.isWaitingPassenger || ped.usesOverbridge) continue;
    if (!inZone(ped.x, ped.y)) continue;

    if (ped.phase === 'waiting') {
      ped.waitTimer += HORN.pedestrianWaitExtensionSeconds;
    } else {
      ped.speedBoostTimer = HORN.pedestrianSpeedBoostSeconds;
    }
  }

  return { hornCooldown: HORN.cooldownSeconds, events: [{ type: 'hornUsed', healthLost: 0 }] };
}

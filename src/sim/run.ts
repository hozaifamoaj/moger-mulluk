// §3.1 Goal and end conditions: pure win/fail checks, kept separate from
// `sim.ts` so its per-step pipeline doesn't have to inline this logic.
import type { FailReason, PlayerVehicleState } from './types';
import { RUN } from './config';

/**
 * §3.1: the finish zone is the last `RUN.finish.length` px of the route (the
 * route's last segment ends at y=0, rule 7). The player must be inside that
 * zone and below `RUN.finish.maxSpeed`.
 */
export function checkFinish(player: PlayerVehicleState): boolean {
  return player.y <= RUN.finish.length && player.y >= 0 && Math.abs(player.speed) < RUN.finish.maxSpeed;
}

/**
 * §3.1: pedestrian contact is an instant fail "in every mode", checked ahead
 * of the other two conditions; wrecked (health <= 0) is checked next, then
 * the timer. The spec doesn't say what should happen if more than one
 * condition is true on the same step — this order is a judgment call.
 */
export function checkFail(
  player: PlayerVehicleState,
  elapsedSeconds: number,
  pedestrianHitThisStep: boolean,
): FailReason | null {
  if (pedestrianHitThisStep) return 'pedestrian';
  if (player.health <= 0) return 'wrecked';
  if (elapsedSeconds >= RUN.timeLimitSeconds) return 'time';
  return null;
}

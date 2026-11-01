import type { Input, PlayerVehicleState, VehicleConfig } from './types';
import { STEERING } from './config';

const DEG_TO_RAD = Math.PI / 180;

/**
 * §4.3 Movement: steering weakens as speed rises, and a vehicle cannot turn
 * while stationary. The spec gives no falloff curve, so this is a linear
 * ramp from 0 at a standstill to `STEERING.minTurnFactor` at maxSpeed
 * (config TODO(tune)).
 */
export function turnFactor(speed: number, maxSpeed: number): number {
  const speedAbs = Math.abs(speed);
  if (speedAbs === 0) return 0;
  const t = Math.min(speedAbs / maxSpeed, 1);
  return 1 - t * (1 - STEERING.minTurnFactor);
}

/**
 * §4.3 Movement: integrates one fixed step of arcade-style movement.
 * `speed = clamp(speed + accel·dt, -reverseMax, maxSpeed)`
 * `heading = heading + steerRate·steerInput·turnFactor(speed)·dt`
 * `x = x + sin(heading)·speed·dt`
 * `y = y − cos(heading)·speed·dt`
 *
 * Pure function: no side effects, no Phaser, no Date.now — the same
 * (state, input, config, dt) always produces the same result.
 */
export function stepVehicle(
  state: PlayerVehicleState,
  input: Input,
  config: VehicleConfig,
  dt: number,
): PlayerVehicleState {
  const accel = input.throttle * config.acceleration - input.brake * config.braking;
  const speed = clamp(state.speed + accel * dt, -config.reverseMax, config.maxSpeed);

  const steerRateRad = config.steerRate * DEG_TO_RAD;
  const heading = state.heading + steerRateRad * input.steer * turnFactor(speed, config.maxSpeed) * dt;

  const x = state.x + Math.sin(heading) * speed * dt;
  const y = state.y - Math.cos(heading) * speed * dt;

  return { ...state, x, y, heading, speed };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

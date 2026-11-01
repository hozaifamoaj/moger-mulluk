import { describe, expect, it } from 'vitest';
import { stepVehicle, turnFactor } from '../../src/sim/vehicle';
import { VEHICLES, SIM } from '../../src/sim/config';
import type { Input, PlayerVehicleState } from '../../src/sim/types';

const car = VEHICLES.car;
const dt = SIM.stepSeconds;

function freshState(overrides: Partial<PlayerVehicleState> = {}): PlayerVehicleState {
  return { x: 0, y: 0, heading: 0, speed: 0, health: car.health, kerbCooldown: 0, fineActive: false, ...overrides };
}

const noInput: Input = { throttle: 0, brake: 0, steer: 0, horn: false };

describe('stepVehicle', () => {
  it('reaches max speed under full throttle and never exceeds it', () => {
    let state = freshState();
    const input: Input = { ...noInput, throttle: 1 };
    for (let i = 0; i < 1000; i++) {
      state = stepVehicle(state, input, car, dt);
      expect(state.speed).toBeLessThanOrEqual(car.maxSpeed);
    }
    expect(state.speed).toBeCloseTo(car.maxSpeed, 5);
  });

  it('braking stops the car, then reverses it, capped at reverseMax', () => {
    let state = freshState({ speed: car.maxSpeed });
    const input: Input = { ...noInput, brake: 1 };

    // Brake long enough to pass through 0 and reach reverseMax.
    for (let i = 0; i < 2000; i++) {
      state = stepVehicle(state, input, car, dt);
      expect(state.speed).toBeGreaterThanOrEqual(-car.reverseMax);
    }
    expect(state.speed).toBeCloseTo(-car.reverseMax, 5);
  });

  it('does not change heading while stationary, even with steering input', () => {
    const state = freshState({ speed: 0 });
    const input: Input = { ...noInput, steer: 1 };
    const next = stepVehicle(state, input, car, dt);
    expect(next.heading).toBe(state.heading);
  });

  it('turns faster at low speed than at max speed', () => {
    const lowSpeedFactor = turnFactor(10, car.maxSpeed);
    const maxSpeedFactor = turnFactor(car.maxSpeed, car.maxSpeed);
    expect(lowSpeedFactor).toBeGreaterThan(maxSpeedFactor);

    const lowSpeedState = freshState({ speed: 10 });
    const maxSpeedState = freshState({ speed: car.maxSpeed });
    const input: Input = { ...noInput, steer: 1 };

    const lowNext = stepVehicle(lowSpeedState, input, car, dt);
    const maxNext = stepVehicle(maxSpeedState, input, car, dt);
    const lowDelta = Math.abs(lowNext.heading - lowSpeedState.heading);
    const maxDelta = Math.abs(maxNext.heading - maxSpeedState.heading);
    expect(lowDelta).toBeGreaterThan(maxDelta);
  });

  it('turnFactor is zero at a standstill', () => {
    expect(turnFactor(0, car.maxSpeed)).toBe(0);
  });
});

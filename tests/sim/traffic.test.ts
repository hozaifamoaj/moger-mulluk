import { describe, expect, it } from 'vitest';
import { stepTraffic } from '../../src/sim/traffic';
import { SIM, TRAFFIC, TRAFFIC_RULES } from '../../src/sim/config';
import type { TrafficVehicleState } from '../../src/sim/types';

const dt = SIM.stepSeconds;
const car = TRAFFIC.car;

// A player far behind the traffic window, so it never acts as an obstacle
// unless a test explicitly moves it into range.
const farPlayer = { x: 0, y: 1_000_000, width: 36, length: 72, speed: 0 };

function freshVehicle(overrides: Partial<TrafficVehicleState> = {}): TrafficVehicleState {
  return {
    active: true,
    type: 'car',
    x: 0,
    y: 0,
    speed: 0,
    cruiseSpeed: car.speedMax,
    width: car.width,
    length: car.length,
    stopTimer: 0,
    sidewaysShift: null,
    nearMissGiven: false,
    ...overrides,
  };
}

describe('stepTraffic', () => {
  it('accelerates an unobstructed vehicle up to its cruise speed and moves it forward', () => {
    const traffic = [freshVehicle({ y: 1000, speed: 0, cruiseSpeed: 250 })];
    let previousY = traffic[0].y;

    for (let i = 0; i < 1000; i++) {
      stepTraffic(traffic, [0], farPlayer, dt);
      expect(traffic[0].speed).toBeLessThanOrEqual(250);
      expect(traffic[0].y).toBeLessThanOrEqual(previousY); // moves toward -y
      previousY = traffic[0].y;
    }

    expect(traffic[0].speed).toBeCloseTo(250, 5);
  });

  it('never lets a vehicle close nearer than the keep-distance gap behind a slower obstacle', () => {
    const ahead = freshVehicle({ y: 1000, speed: 0, cruiseSpeed: 0 }); // stopped, so it won't drift mid-assertion
    const minFrontBumperY = ahead.y + ahead.length / 2 + TRAFFIC_RULES.keepDistanceGap + car.length / 2;
    const behind = freshVehicle({ y: minFrontBumperY, speed: 1000, cruiseSpeed: 1000 });
    const traffic = [ahead, behind];

    // ahead (index 0) processed first, per the ascending-y contract.
    stepTraffic(traffic, [0, 1], farPlayer, dt);

    expect(behind.y).toBeCloseTo(minFrontBumperY, 5);
    expect(behind.speed).toBeCloseTo(0, 5);
  });

  it('closes the gap gradually at the configured max deceleration when not already at the floor', () => {
    const ahead = freshVehicle({ y: 1000, speed: 50, cruiseSpeed: 50 });
    // 100px between bumpers: within the look-ahead window, but well clear of
    // the hard keep-distance floor, so the clamp shouldn't fire this step.
    const behind = freshVehicle({ y: ahead.y + ahead.length / 2 + 100 + car.length / 2, speed: 400, cruiseSpeed: 400 });
    const traffic = [ahead, behind];
    const maxDelta = TRAFFIC_RULES.keepDistanceMaxDecel * dt;

    stepTraffic(traffic, [0, 1], farPlayer, dt);

    expect(behind.speed).toBeCloseTo(400 - maxDelta, 5);
  });

  it('pauses a vehicle with an active stopTimer: zero speed, unchanged position, timer ticking down', () => {
    const vehicle = freshVehicle({ y: 500, speed: 200, stopTimer: 0.5 });
    const traffic = [vehicle];

    stepTraffic(traffic, [0], farPlayer, dt);

    expect(vehicle.y).toBe(500);
    expect(vehicle.speed).toBe(0);
    expect(vehicle.stopTimer).toBeCloseTo(0.5 - dt, 10);
  });

  it('cancels a sideways shift (and does not move laterally) when the target space is blocked', () => {
    const shifting = freshVehicle({
      x: 100,
      y: 1000,
      speed: 0,
      sidewaysShift: { remainingTriggerDistance: 0, magnitude: 40, side: 1, progress: 0 },
    });
    // Occupies the space the shift would move into, directly alongside.
    const blocker = freshVehicle({ x: 100 + 40, y: 1000, speed: 0 });
    const traffic = [shifting, blocker];

    stepTraffic(traffic, [0, 1], farPlayer, dt);

    expect(shifting.sidewaysShift).toBeNull();
    expect(shifting.x).toBe(100);
  });

  it('completes a sideways shift of the configured magnitude when the target space is clear', () => {
    const shifting = freshVehicle({
      x: 100,
      y: 1000,
      speed: 0,
      sidewaysShift: { remainingTriggerDistance: 0, magnitude: 40, side: 1, progress: 0 },
    });
    const traffic = [shifting];

    for (let i = 0; i < 100 && shifting.sidewaysShift !== null; i++) {
      stepTraffic(traffic, [0], farPlayer, dt);
    }

    expect(shifting.sidewaysShift).toBeNull();
    expect(shifting.x).toBeCloseTo(140, 5);
  });
});

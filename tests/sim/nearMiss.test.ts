import { describe, expect, it } from 'vitest';
import { detectNearMisses } from '../../src/sim/collision';
import { NEAR_MISS, VEHICLES } from '../../src/sim/config';
import type { PlayerVehicleState, TrafficVehicleState } from '../../src/sim/types';

const car = VEHICLES.car;

function playerAt(x: number, overrides: Partial<PlayerVehicleState> = {}): PlayerVehicleState {
  return {
    x,
    y: 0,
    heading: 0,
    speed: car.maxSpeed * (NEAR_MISS.speedThreshold + 0.1),
    health: car.health,
    kerbCooldown: 0,
    fineActive: false,
    ...overrides,
  };
}

function trafficAt(x: number, overrides: Partial<TrafficVehicleState> = {}): TrafficVehicleState {
  return {
    active: true,
    type: 'car',
    x,
    y: 0,
    speed: 0,
    cruiseSpeed: 0,
    width: 36,
    length: 72,
    stopTimer: 0,
    sidewaysShift: null,
    drift: null,
    direction: 1,
    lastBusStopY: null,
    nearMissGiven: false,
    ...overrides,
  };
}

describe('detectNearMisses', () => {
  it('counts a close pass that does not touch, above the speed threshold', () => {
    // Player half-width 18, vehicle half-width 18, gap 8px: within the 12px band.
    const vehicle = trafficAt(18 + 8 + 18);
    const player = playerAt(0);

    const { nearMissCount, events } = detectNearMisses(player, [vehicle], car, 0);

    expect(nearMissCount).toBe(1);
    expect(events).toContainEqual({ type: 'nearMiss', healthLost: 0, trafficId: 0 });
    expect(vehicle.nearMissGiven).toBe(true);
  });

  it('does not count a pass below the speed threshold', () => {
    const vehicle = trafficAt(18 + 8 + 18);
    const player = playerAt(0, { speed: car.maxSpeed * (NEAR_MISS.speedThreshold - 0.1) });

    const { nearMissCount, events } = detectNearMisses(player, [vehicle], car, 0);

    expect(nearMissCount).toBe(0);
    expect(events).toHaveLength(0);
    expect(vehicle.nearMissGiven).toBe(false);
  });

  it('does not count an actual overlap as a near miss', () => {
    const vehicle = trafficAt(10); // well within both half-widths: touching, not passing
    const player = playerAt(0);

    const { nearMissCount, events } = detectNearMisses(player, [vehicle], car, 0);

    expect(nearMissCount).toBe(0);
    expect(events).toHaveLength(0);
  });

  it('does not count a vehicle twice', () => {
    const vehicle = trafficAt(18 + 8 + 18, { nearMissGiven: true });
    const player = playerAt(0);

    const { nearMissCount, events } = detectNearMisses(player, [vehicle], car, 5);

    expect(nearMissCount).toBe(5);
    expect(events).toHaveLength(0);
  });

  it('stops counting once the per-run cap is reached', () => {
    const vehicle = trafficAt(18 + 8 + 18);
    const player = playerAt(0);

    const { nearMissCount, events } = detectNearMisses(player, [vehicle], car, NEAR_MISS.cap);

    expect(nearMissCount).toBe(NEAR_MISS.cap);
    expect(events).toHaveLength(0);
    expect(vehicle.nearMissGiven).toBe(false);
  });
});

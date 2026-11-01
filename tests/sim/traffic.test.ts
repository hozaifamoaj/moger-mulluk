import { describe, expect, it } from 'vitest';
import { stepTraffic } from '../../src/sim/traffic';
import {
  SIM,
  TRAFFIC,
  TRAFFIC_RULES,
  RICKSHAW_DRIFT,
  MOTORCYCLE_WEAVE,
  MOTORCYCLE_WRONG_WAY,
  JAM,
  BUS_STOP,
  CNG_CUTIN,
} from '../../src/sim/config';
import { createDefaultTestMap, RouteMap } from '../../src/sim/map';
import { Rng } from '../../src/sim/rng';
import type { TrafficVehicleState } from '../../src/sim/types';

const dt = SIM.stepSeconds;
const car = TRAFFIC.car;
const map = createDefaultTestMap();

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
    drift: null,
    direction: 1,
    lastBusStopY: null,
    nearMissGiven: false,
    ...overrides,
  };
}

function freshRng(): Rng {
  return new Rng(1);
}

describe('stepTraffic', () => {
  it('accelerates an unobstructed vehicle up to its cruise speed and moves it forward', () => {
    const traffic = [freshVehicle({ y: 1000, speed: 0, cruiseSpeed: 250 })];
    let previousY = traffic[0].y;

    for (let i = 0; i < 1000; i++) {
      stepTraffic(traffic, [0], farPlayer, dt, map, freshRng());
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
    stepTraffic(traffic, [0, 1], farPlayer, dt, map, freshRng());

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

    stepTraffic(traffic, [0, 1], farPlayer, dt, map, freshRng());

    expect(behind.speed).toBeCloseTo(400 - maxDelta, 5);
  });

  it('pauses a vehicle with an active stopTimer: zero speed, unchanged position, timer ticking down', () => {
    const vehicle = freshVehicle({ y: 500, speed: 200, stopTimer: 0.5 });
    const traffic = [vehicle];

    stepTraffic(traffic, [0], farPlayer, dt, map, freshRng());

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

    stepTraffic(traffic, [0, 1], farPlayer, dt, map, freshRng());

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
      stepTraffic(traffic, [0], farPlayer, dt, map, freshRng());
    }

    expect(shifting.sidewaysShift).toBeNull();
    expect(shifting.x).toBeCloseTo(140, 5);
  });

  it('cuts a CNG into the nearest clear gap from CNG_CUTIN.offsets, skipping a blocked nearer side', () => {
    const cng = freshVehicle({
      type: 'cng',
      x: 200,
      y: 1000,
      speed: 0,
      cruiseSpeed: 0,
      sidewaysShift: { remainingTriggerDistance: 0, magnitude: 0, side: 1, progress: 0 },
    });
    // Sits directly where the nearest offset (-30) would move the CNG into.
    const blocker = freshVehicle({ x: 200 - 30, y: 1000, speed: 0, cruiseSpeed: 0 });
    const traffic = [cng, blocker];

    for (let i = 0; i < 100 && cng.sidewaysShift !== null; i++) {
      stepTraffic(traffic, [0, 1], farPlayer, dt, map, freshRng());
    }

    expect(cng.sidewaysShift).toBeNull();
    expect(cng.x).toBeCloseTo(200 + CNG_CUTIN.offsets[1], 5); // -30 blocked, next-nearest (30) taken
  });
});

describe('rickshaw/motorcycle continuous drift', () => {
  it('keeps a rickshaw oscillating within its configured amplitude around its base x', () => {
    const vehicle = freshVehicle({
      type: 'rickshaw',
      x: 100,
      y: 10000,
      speed: 0,
      cruiseSpeed: 0,
      drift: { baseX: 100, phase: 0 },
    });
    const traffic = [vehicle];

    for (let i = 0; i < 300; i++) {
      stepTraffic(traffic, [0], farPlayer, dt, map, freshRng());
      expect(Math.abs(vehicle.x - 100)).toBeLessThanOrEqual(RICKSHAW_DRIFT.amplitude + 1e-6);
    }
  });

  it('keeps a motorcycle oscillating within its configured weave amplitude around its base x', () => {
    const vehicle = freshVehicle({
      type: 'motorcycle',
      x: 200,
      y: 10000,
      speed: 0,
      cruiseSpeed: 0,
      drift: { baseX: 200, phase: 0 },
    });
    const traffic = [vehicle];

    for (let i = 0; i < 300; i++) {
      stepTraffic(traffic, [0], farPlayer, dt, map, freshRng());
      expect(Math.abs(vehicle.x - 200)).toBeLessThanOrEqual(MOTORCYCLE_WEAVE.amplitude + 1e-6);
    }
  });
});

describe('wrong-way motorcycle', () => {
  it('moves toward the player (increasing y) at the fixed wrong-way speed, bypassing the keep-distance rule', () => {
    const vehicle = freshVehicle({
      type: 'motorcycle',
      x: 100,
      y: 10000,
      speed: MOTORCYCLE_WRONG_WAY.speed,
      cruiseSpeed: MOTORCYCLE_WRONG_WAY.speed,
      direction: -1,
      drift: null,
    });
    // Directly ahead (smaller y): a same-direction vehicle would have to
    // brake for this, but a wrong-way motorcycle ignores it entirely.
    const obstacle = freshVehicle({ y: vehicle.y - 50, speed: 0, cruiseSpeed: 0 });
    const traffic = [obstacle, vehicle];
    const previousY = vehicle.y;

    stepTraffic(traffic, [0, 1], farPlayer, dt, map, freshRng());

    expect(vehicle.y).toBeCloseTo(previousY + MOTORCYCLE_WRONG_WAY.speed * dt, 5);
    expect(vehicle.speed).toBe(MOTORCYCLE_WRONG_WAY.speed);
  });
});

describe('jam zone speed cap', () => {
  it("caps a vehicle's speed at JAM.speedCap while inside a mapped jam zone", () => {
    const jamMap = new RouteMap([
      {
        id: 'jam-test',
        length: 20000,
        lanes: 3,
        divider: true,
        density: 'low',
        spawn: {},
        features: [{ type: 'jam', from: 5000, to: 15000 }],
      },
    ]);
    const vehicle = freshVehicle({ y: 10000, speed: 0, cruiseSpeed: car.speedMax });
    const traffic = [vehicle];

    for (let i = 0; i < 2000; i++) {
      stepTraffic(traffic, [0], farPlayer, dt, jamMap, freshRng());
      expect(vehicle.speed).toBeLessThanOrEqual(JAM.speedCap);
    }

    expect(vehicle.speed).toBeCloseTo(JAM.speedCap, 5);
  });

  it('does not cap speed outside the jam zone', () => {
    const jamMap = new RouteMap([
      {
        id: 'jam-test',
        length: 20000,
        lanes: 3,
        divider: true,
        density: 'low',
        spawn: {},
        features: [{ type: 'jam', from: 5000, to: 15000 }],
      },
    ]);
    const vehicle = freshVehicle({ y: 1000, speed: 0, cruiseSpeed: car.speedMax });
    const traffic = [vehicle];

    for (let i = 0; i < 2000; i++) {
      stepTraffic(traffic, [0], farPlayer, dt, jamMap, freshRng());
    }

    expect(vehicle.speed).toBeCloseTo(car.speedMax, 5);
  });
});

describe('bus stop dwell', () => {
  const busStopMap = new RouteMap([
    {
      id: 'busstop-test',
      length: 20000,
      lanes: 3,
      divider: true,
      density: 'low',
      spawn: {},
      features: [{ type: 'busStop', at: 10000 }],
    },
  ]);

  it('stops a bus for a rolled duration within [minDwellSeconds, maxDwellSeconds] on reaching a mapped bus stop', () => {
    const bus = freshVehicle({ type: 'bus', y: 10001, speed: 100, cruiseSpeed: 100 });
    const traffic = [bus];

    stepTraffic(traffic, [0], farPlayer, dt, busStopMap, new Rng(42));

    expect(bus.stopTimer).toBeGreaterThanOrEqual(BUS_STOP.minDwellSeconds);
    expect(bus.stopTimer).toBeLessThanOrEqual(BUS_STOP.maxDwellSeconds);
    expect(bus.lastBusStopY).toBe(10000);
  });

  it('does not re-trigger the dwell timer at a stop it has already dwelled at', () => {
    const bus = freshVehicle({ type: 'bus', y: 9999, speed: 0, cruiseSpeed: 100, lastBusStopY: 10000, stopTimer: 0 });
    const traffic = [bus];

    stepTraffic(traffic, [0], farPlayer, dt, busStopMap, new Rng(42));

    expect(bus.stopTimer).toBe(0);
  });
});

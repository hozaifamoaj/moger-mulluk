import { describe, expect, it } from 'vitest';
import {
  createPedestrianPool,
  placeWaitingPassengers,
  spawnPedestrians,
  stepPedestrians,
} from '../../src/sim/pedestrian';
import { RouteMap } from '../../src/sim/map';
import { PEDESTRIAN, HORN, SIM } from '../../src/sim/config';
import { Rng } from '../../src/sim/rng';
import type { PedestrianState } from '../../src/sim/types';

const dt = SIM.stepSeconds;

function freshPedestrian(overrides: Partial<PedestrianState> = {}): PedestrianState {
  return {
    active: true,
    crossingIndex: 0,
    isWaitingPassenger: false,
    usesOverbridge: false,
    phase: 'waiting',
    x: 0,
    y: 0,
    startX: 0,
    targetX: 100,
    speed: 60,
    waitTimer: 0,
    midwayStopX: null,
    hasStoppedMidway: false,
    stopTimer: 0,
    speedBoostTimer: 0,
    ...overrides,
  };
}

describe('createPedestrianPool', () => {
  it('creates a fixed-size pool of inactive slots', () => {
    const pool = createPedestrianPool();
    expect(pool).toHaveLength(PEDESTRIAN.poolCapacity);
    expect(pool.every((p) => !p.active)).toBe(true);
  });
});

describe('placeWaitingPassengers', () => {
  const busStopMap = new RouteMap([
    {
      id: 'a',
      length: 3000,
      lanes: 3,
      divider: true,
      density: 'low',
      spawn: {},
      features: [{ type: 'busStop', at: 1200 }],
    },
  ]);

  it('activates one pedestrian per map.waitingPassengers entry, marked isWaitingPassenger with an infinite wait', () => {
    const pool = createPedestrianPool();
    placeWaitingPassengers(pool, busStopMap);

    const placed = pool.filter((p) => p.active);
    expect(placed).toHaveLength(busStopMap.waitingPassengers.length);
    for (const p of placed) {
      expect(p.isWaitingPassenger).toBe(true);
      expect(p.crossingIndex).toBe(-1);
      expect(p.waitTimer).toBe(Infinity);
    }
  });

  it('never moves or deactivates a waiting passenger, even over many steps', () => {
    const pool = createPedestrianPool();
    placeWaitingPassengers(pool, busStopMap);
    const passenger = pool.find((p) => p.active);
    expect(passenger).toBeDefined();
    const { x, y } = passenger!;

    for (let i = 0; i < 600; i++) stepPedestrians(pool, dt);

    expect(passenger!.x).toBe(x);
    expect(passenger!.y).toBe(y);
    expect(passenger!.active).toBe(true);
  });
});

describe('stepPedestrians', () => {
  it('holds a waiting pedestrian in place until waitTimer elapses, then starts walking', () => {
    const pool = [freshPedestrian({ phase: 'waiting', waitTimer: 0.1, x: 0, startX: 0, targetX: 50 })];

    stepPedestrians(pool, dt); // not yet elapsed
    expect(pool[0].phase).toBe('waiting');
    expect(pool[0].x).toBe(0);

    for (let i = 0; i < 10; i++) stepPedestrians(pool, dt);
    expect(pool[0].phase).not.toBe('waiting');
  });

  it('walks from startX toward targetX at the rolled speed', () => {
    const pool = [freshPedestrian({ phase: 'walking', waitTimer: 0, x: 0, startX: 0, targetX: 1000, speed: 60 })];
    stepPedestrians(pool, dt);
    expect(pool[0].x).toBeCloseTo(60 * dt, 5);
  });

  it('walks the other way when targetX is below startX', () => {
    const pool = [freshPedestrian({ phase: 'walking', waitTimer: 0, x: 1000, startX: 1000, targetX: 0, speed: 60 })];
    stepPedestrians(pool, dt);
    expect(pool[0].x).toBeCloseTo(1000 - 60 * dt, 5);
  });

  it('pauses for the configured duration at midwayStopX, exactly once', () => {
    const pool = [
      freshPedestrian({
        phase: 'walking',
        x: 0,
        startX: 0,
        targetX: 1000,
        speed: 3000, // fast enough to cross the midway mark within one step
        midwayStopX: 50,
        hasStoppedMidway: false,
      }),
    ];

    stepPedestrians(pool, dt);
    expect(pool[0].phase).toBe('stoppedMidway');
    expect(pool[0].x).toBe(50);
    expect(pool[0].hasStoppedMidway).toBe(true);

    const stopSteps = Math.ceil(PEDESTRIAN.midwayStopDurationSeconds / dt);
    for (let i = 0; i < stopSteps - 1; i++) {
      stepPedestrians(pool, dt);
      expect(pool[0].phase).toBe('stoppedMidway');
      expect(pool[0].x).toBe(50);
    }

    stepPedestrians(pool, dt); // the stop timer elapses this step
    expect(pool[0].phase).toBe('walking');

    stepPedestrians(pool, dt); // resumes walking, does not re-stop at the same mark
    expect(pool[0].phase).toBe('walking');
    expect(pool[0].x).toBeGreaterThan(50);
  });

  it('deactivates the pedestrian once it reaches targetX, returning the slot to the pool', () => {
    const pool = [freshPedestrian({ phase: 'walking', x: 95, startX: 0, targetX: 100, speed: 1000 })];
    stepPedestrians(pool, dt);
    expect(pool[0].active).toBe(false);
  });

  it('applies the horn speed-boost multiplier while speedBoostTimer is active', () => {
    const boosted = [freshPedestrian({ phase: 'walking', x: 0, startX: 0, targetX: 1000, speed: 60, speedBoostTimer: 1 })];
    const unboosted = [freshPedestrian({ phase: 'walking', x: 0, startX: 0, targetX: 1000, speed: 60, speedBoostTimer: 0 })];

    stepPedestrians(boosted, dt);
    stepPedestrians(unboosted, dt);

    expect(boosted[0].x).toBeCloseTo(unboosted[0].x * HORN.pedestrianSpeedBoostMultiplier, 5);
  });

  it('ticks speedBoostTimer down and lets the boost expire', () => {
    const pool = [freshPedestrian({ phase: 'walking', x: 0, startX: 0, targetX: 1000, speed: 60, speedBoostTimer: dt / 2 })];
    stepPedestrians(pool, dt);
    expect(pool[0].speedBoostTimer).toBe(0);
  });

  it('skips isWaitingPassenger slots entirely, even if active with non-waiting fields set', () => {
    const pool = [
      freshPedestrian({ isWaitingPassenger: true, phase: 'walking', x: 10, startX: 0, targetX: 1000, speed: 60 }),
    ];
    stepPedestrians(pool, dt);
    expect(pool[0].x).toBe(10);
    expect(pool[0].phase).toBe('walking'); // untouched, not reset either
  });
});

describe('spawnPedestrians', () => {
  const crossingMap = new RouteMap([
    {
      id: 'a',
      length: 3000,
      lanes: 3,
      divider: true,
      density: 'low',
      spawn: {},
      features: [{ type: 'crossing', at: 1500 }],
    },
  ]);

  const overbridgeMap = new RouteMap([
    {
      id: 'a',
      length: 3000,
      lanes: 3,
      divider: true,
      density: 'low',
      spawn: {},
      features: [{ type: 'crossing', at: 1500, overbridge: true }],
    },
  ]);

  it('spawns a pedestrian waiting on the footpath, at the crossing zone y, for at least the minimum warning time', () => {
    const pool = createPedestrianPool();
    const timers = [0];
    spawnPedestrians(pool, new Rng(1), crossingMap, timers, dt);

    const spawned = pool.filter((p) => p.active);
    expect(spawned.length).toBeGreaterThan(0);
    for (const p of spawned) {
      expect(p.phase).toBe('waiting');
      expect(p.waitTimer).toBeGreaterThanOrEqual(PEDESTRIAN.minWarningSeconds);
      expect(p.waitTimer).toBeLessThanOrEqual(PEDESTRIAN.maxWarningSeconds);
      expect(p.y).toBe(crossingMap.crossings[0].y);
      expect(p.crossingIndex).toBe(0);
      expect(p.startX).not.toBe(p.targetX);
    }
  });

  it('resets the per-zone spawn timer to within [spawnIntervalMin, spawnIntervalMax] after spawning', () => {
    const pool = createPedestrianPool();
    const timers = [0];
    spawnPedestrians(pool, new Rng(1), crossingMap, timers, dt);

    expect(timers[0]).toBeGreaterThanOrEqual(PEDESTRIAN.spawnIntervalMin);
    expect(timers[0]).toBeLessThanOrEqual(PEDESTRIAN.spawnIntervalMax);
  });

  it('never lets more than maxPerZone non-overbridge pedestrians be on the road for a zone at once', () => {
    const pool = createPedestrianPool();
    const timers = [0];
    const rng = new Rng(7);

    for (let i = 0; i < 8000; i++) {
      spawnPedestrians(pool, rng, crossingMap, timers, dt);
      stepPedestrians(pool, dt);

      const onRoad = pool.filter((p) => p.active && !p.usesOverbridge && p.crossingIndex === 0).length;
      expect(onRoad).toBeLessThanOrEqual(PEDESTRIAN.maxPerZone);
    }
  });

  it('can route a spawn group onto the overbridge when the zone allows it, excluding them from the road cap', () => {
    const pool = createPedestrianPool();
    const timers = [0];
    const rng = new Rng(3);

    let sawOverbridge = false;
    for (let i = 0; i < 4000; i++) {
      spawnPedestrians(pool, rng, overbridgeMap, timers, dt);
      stepPedestrians(pool, dt);
      if (pool.some((p) => p.active && p.usesOverbridge)) sawOverbridge = true;

      const onRoad = pool.filter((p) => p.active && !p.usesOverbridge && p.crossingIndex === 0).length;
      expect(onRoad).toBeLessThanOrEqual(PEDESTRIAN.maxPerZone);
    }

    expect(sawOverbridge).toBe(true);
  });

  it('skips the spawn attempt (and retries next call) when the pool has no free slots', () => {
    const pool = createPedestrianPool();
    for (const slot of pool) slot.active = true; // exhaust the pool
    const timers = [0];

    expect(() => spawnPedestrians(pool, new Rng(1), crossingMap, timers, dt)).not.toThrow();
    expect(pool.every((p) => p.active)).toBe(true); // unchanged: nothing clobbered
  });
});

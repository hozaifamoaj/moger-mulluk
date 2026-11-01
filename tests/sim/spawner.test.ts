import { describe, expect, it } from 'vitest';
import { createTrafficPool } from '../../src/sim/traffic';
import { despawnBehindPlayer, fillInitialTraffic, spawnTraffic } from '../../src/sim/spawner';
import { Rng } from '../../src/sim/rng';
import { SPAWN, VEHICLES, MOTORCYCLE_WRONG_WAY } from '../../src/sim/config';
import { computeRoadEdges } from '../../src/sim/road';
import { createDefaultTestMap, RouteMap } from '../../src/sim/map';
import type { TrafficVehicleState } from '../../src/sim/types';

const player = { x: 0, y: 0, width: VEHICLES.car.width, length: VEHICLES.car.length };
const map = createDefaultTestMap();
const targetActiveCount = map.targetActiveCountAt(player.y);

function rectsOverlap(
  a: { x: number; y: number; width: number; length: number },
  b: { x: number; y: number; width: number; length: number },
): boolean {
  return Math.abs(a.x - b.x) < a.width / 2 + b.width / 2 && Math.abs(a.y - b.y) < a.length / 2 + b.length / 2;
}

describe('despawnBehindPlayer', () => {
  it('deactivates vehicles once far enough behind the player, leaves closer ones active', () => {
    const far: TrafficVehicleState = {
      active: true,
      type: 'car',
      x: 0,
      y: SPAWN.behindPlayerDespawnDistance + 1,
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
    };
    const near: TrafficVehicleState = { ...far, y: SPAWN.behindPlayerDespawnDistance - 1 };
    const traffic = [far, near];

    despawnBehindPlayer(traffic, 0);

    expect(far.active).toBe(false);
    expect(near.active).toBe(true);
  });
});

describe('fillInitialTraffic', () => {
  it('spawns up to the target active count, all within the player carriageway and non-overlapping', () => {
    const traffic = createTrafficPool();
    const rng = new Rng(1);
    fillInitialTraffic(traffic, rng, player, map);

    const active = traffic.filter((v) => v.active);
    expect(active.length).toBe(targetActiveCount);

    const edges = computeRoadEdges();
    for (const vehicle of active) {
      expect(vehicle.x - vehicle.width / 2).toBeGreaterThanOrEqual(edges.footpathPlayerRightX);
      expect(vehicle.x + vehicle.width / 2).toBeLessThanOrEqual(edges.dividerLeftX);
    }

    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        expect(rectsOverlap(active[i], active[j])).toBe(false);
      }
    }
  });

  it('is deterministic for a given seed', () => {
    const trafficA = createTrafficPool();
    const trafficB = createTrafficPool();
    fillInitialTraffic(trafficA, new Rng(7), player, map);
    fillInitialTraffic(trafficB, new Rng(7), player, map);
    expect(trafficA).toEqual(trafficB);
  });
});

describe('spawnTraffic', () => {
  it('tops up an under-populated pool without overlapping existing vehicles, skipping slots it cannot place', () => {
    const traffic = createTrafficPool();
    const rng = new Rng(3);

    // Pre-seed one active vehicle, including right where a naive spawn roll
    // would otherwise land, to exercise the overlap-retry path. Per §5.1
    // rule 4, a slot that can't find a clear spot within the attempt budget
    // is skipped for this call rather than retried indefinitely — so the
    // pool may land short of the target, but must never overlap.
    traffic[0].active = true;
    traffic[0].type = 'car';
    traffic[0].x = player.x;
    traffic[0].y = player.y - 1000;
    traffic[0].width = 36;
    traffic[0].length = 72;
    traffic[0].speed = 250;
    traffic[0].cruiseSpeed = 250;

    spawnTraffic(traffic, rng, player, map);

    const active = traffic.filter((v) => v.active);
    expect(active.length).toBeGreaterThan(1);
    expect(active.length).toBeLessThanOrEqual(targetActiveCount);

    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        expect(rectsOverlap(active[i], active[j])).toBe(false);
      }
    }
  });

  it('does nothing when the pool is already at the target active count', () => {
    const traffic = createTrafficPool();
    fillInitialTraffic(traffic, new Rng(5), player, map);
    const before = traffic.map((v) => ({ ...v }));

    spawnTraffic(traffic, new Rng(99), player, map);

    expect(traffic).toEqual(before);
  });

  it('spawns rickshaws in clusters sized within [minSize, maxSize], never overlapping', () => {
    const rickshawMap = new RouteMap([
      {
        id: 'rickshaw-test',
        length: 20000,
        lanes: 3,
        divider: true,
        density: 'high',
        spawn: { rickshaw: 20 },
        features: [],
      },
    ]);
    const traffic = createTrafficPool();
    fillInitialTraffic(traffic, new Rng(11), player, rickshawMap);

    const active = traffic.filter((v) => v.active);
    expect(active.length).toBeGreaterThan(0);
    for (const vehicle of active) {
      expect(vehicle.type).toBe('rickshaw');
    }

    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        expect(rectsOverlap(active[i], active[j])).toBe(false);
      }
    }
  });

  it('spawns a motorcycle wrong-way, heading toward the player, inside a mapped wrongWay zone', () => {
    const wrongWayMap = new RouteMap([
      {
        id: 'wrongway-test',
        length: 20000,
        lanes: 3,
        divider: true,
        density: 'low',
        spawn: { motorcycle: 10 },
        features: [{ type: 'wrongWay', from: 0, to: 20000 }],
      },
    ]);
    // Positioned well inside the segment (not at its y=0 edge) so the whole
    // spawn window ahead of the player falls inside the mapped wrongWay zone.
    const midSegmentPlayer = { ...player, y: 10000 };
    const traffic = createTrafficPool();
    fillInitialTraffic(traffic, new Rng(2), midSegmentPlayer, wrongWayMap);

    const active = traffic.filter((v) => v.active);
    expect(active.length).toBeGreaterThan(0);
    for (const vehicle of active) {
      expect(vehicle.type).toBe('motorcycle');
      expect(vehicle.direction).toBe(-1);
      expect(vehicle.speed).toBe(MOTORCYCLE_WRONG_WAY.speed);
      expect(vehicle.cruiseSpeed).toBe(MOTORCYCLE_WRONG_WAY.speed);
      expect(vehicle.drift).toBeNull();
    }
  });
});

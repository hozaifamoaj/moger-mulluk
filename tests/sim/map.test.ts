import { describe, expect, it } from 'vitest';
import { validateSegments, RouteMap } from '../../src/sim/map';
import { computeRoadEdges } from '../../src/sim/road';
import { TRAFFIC } from '../../src/sim/config';

const validSegment = {
  id: 'seg-1',
  length: 3000,
  lanes: 3,
  divider: true,
  density: 'medium',
  spawn: { car: 4, bus: 2 },
  features: [{ type: 'busStop', at: 1200 }],
};

describe('validateSegments', () => {
  it('accepts a well-formed segment array', () => {
    const result = validateSegments([validSegment]);
    expect(result.valid).toBe(true);
  });

  it('rejects a non-array payload', () => {
    const result = validateSegments({ not: 'an array' });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects an empty array', () => {
    const result = validateSegments([]);
    expect(result.valid).toBe(false);
  });

  it('collects every error across multiple bad fields rather than stopping at the first', () => {
    const bad = { id: '', length: -5, lanes: 4, divider: 'yes', density: 'extreme', spawn: null, features: 'nope' };
    const result = validateSegments([bad]);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes('.id'))).toBe(true);
      expect(result.errors.some((e) => e.includes('.length'))).toBe(true);
      expect(result.errors.some((e) => e.includes('.lanes'))).toBe(true);
      expect(result.errors.some((e) => e.includes('.divider'))).toBe(true);
      expect(result.errors.some((e) => e.includes('.density'))).toBe(true);
      expect(result.errors.some((e) => e.includes('.spawn'))).toBe(true);
      expect(result.errors.some((e) => e.includes('.features'))).toBe(true);
    }
  });

  it('rejects an unknown spawn traffic type', () => {
    const result = validateSegments([{ ...validSegment, spawn: { helicopter: 2 } }]);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.some((e) => e.includes('unknown traffic type'))).toBe(true);
  });

  it('rejects an unknown feature type', () => {
    const result = validateSegments([{ ...validSegment, features: [{ type: 'teleporter', at: 100 }] }]);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.some((e) => e.includes('unknown feature type'))).toBe(true);
  });

  it('rejects a feature "at" offset outside the segment length', () => {
    const result = validateSegments([{ ...validSegment, features: [{ type: 'busStop', at: 99999 }] }]);
    expect(result.valid).toBe(false);
  });

  it('rejects a range feature where "from" is not less than "to"', () => {
    const result = validateSegments([{ ...validSegment, features: [{ type: 'jam', from: 2000, to: 1000 }] }]);
    expect(result.valid).toBe(false);
  });

  it('rejects a parked feature with a missing side or non-positive count', () => {
    const result = validateSegments([
      { ...validSegment, features: [{ type: 'parked', at: 500, side: 'up', count: 0 }] },
    ]);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes('.side'))).toBe(true);
      expect(result.errors.some((e) => e.includes('.count'))).toBe(true);
    }
  });
});

describe('RouteMap', () => {
  it('lays segments back-to-back, with the first segment starting at the total length and the last ending at 0', () => {
    const map = new RouteMap([
      { id: 'a', length: 1000, lanes: 3, divider: true, density: 'low', spawn: {}, features: [] },
      { id: 'b', length: 500, lanes: 2, divider: true, density: 'low', spawn: {}, features: [] },
    ]);

    expect(map.totalLength).toBe(1500);
    expect(map.laneCountAt(1500)).toBe(3); // first segment, furthest from the finish
    expect(map.laneCountAt(400)).toBe(2); // second segment, nearest the finish
    expect(map.laneCountAt(0)).toBe(2);
  });

  it('converts a segment-relative busStop offset into an absolute y', () => {
    const map = new RouteMap([
      { id: 'a', length: 3000, lanes: 3, divider: true, density: 'low', spawn: {}, features: [{ type: 'busStop', at: 1200 }] },
    ]);
    expect(map.busStops).toEqual([1800]); // totalLength(3000) - at(1200)
  });

  it('reports a dividerGap only within its mapped window', () => {
    const map = new RouteMap([
      {
        id: 'a',
        length: 20000,
        lanes: 3,
        divider: true,
        density: 'low',
        spawn: {},
        features: [{ type: 'dividerGap', at: 10000, length: 200 }],
      },
    ]);
    expect(map.dividerGapAt(10000)).toBe(true);
    expect(map.dividerGapAt(10099)).toBe(true);
    expect(map.dividerGapAt(10101)).toBe(false);
  });

  it('reports police/jam/wrongWay zones only within their mapped from/to ranges', () => {
    const map = new RouteMap([
      {
        id: 'a',
        length: 20000,
        lanes: 3,
        divider: true,
        density: 'low',
        spawn: {},
        features: [
          { type: 'police', from: 5000, to: 15000 },
          { type: 'jam', from: 1000, to: 2000 },
          { type: 'wrongWay', from: 16000, to: 17000 },
        ],
      },
    ]);

    // Feature "from"/"to" are segment-relative, measured from the segment's
    // start (the far side, highest y); absolute zone = [L - to, L - from].
    expect(map.policeZoneAt(10000)).toBe(true); // [5000, 15000]
    expect(map.policeZoneAt(4000)).toBe(false);
    expect(map.jamSpeedCapAt(18500)).toBe(true); // [18000, 19000]
    expect(map.jamSpeedCapAt(500)).toBe(false);
    expect(map.wrongWayZoneAt(3500)).toBe(true); // [3000, 4000]
    expect(map.wrongWayZoneAt(10000)).toBe(false);
  });

  it('places parked vehicles on the correct side, clear of the kerb/divider line, spaced along y', () => {
    const map = new RouteMap([
      {
        id: 'a',
        length: 3000,
        lanes: 3,
        divider: true,
        density: 'low',
        spawn: {},
        features: [{ type: 'parked', at: 1000, side: 'left', count: 2 }],
      },
    ]);
    const edges = computeRoadEdges(3);
    const config = TRAFFIC.parked;

    expect(map.parkedVehicles).toHaveLength(2);
    for (const vehicle of map.parkedVehicles) {
      expect(vehicle.x).toBeGreaterThan(edges.footpathPlayerRightX);
      expect(vehicle.x + vehicle.width / 2).toBeLessThan(edges.dividerLeftX);
    }
    expect(Math.abs(map.parkedVehicles[0].y - map.parkedVehicles[1].y)).toBeCloseTo(config.length + 10, 5);
  });

  it('returns a per-segment spawn table filtered to non-zero entries, and its count sum as the target active count', () => {
    const map = new RouteMap([
      { id: 'a', length: 1000, lanes: 3, divider: true, density: 'low', spawn: { car: 5, bus: 0, rickshaw: 3 }, features: [] },
    ]);
    const table = map.spawnTableAt(500);
    expect(table).toEqual([
      { type: 'car', count: 5 },
      { type: 'rickshaw', count: 3 },
    ]);
    expect(map.targetActiveCountAt(500)).toBe(8);
  });
});

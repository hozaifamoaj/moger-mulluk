import { describe, expect, it } from 'vitest';
import { satOverlap, satOverlapInflated, type RotatedRect } from '../../src/sim/sat';

function rect(x: number, y: number, halfWidth: number, halfLength: number, heading = 0): RotatedRect {
  return { x, y, halfWidth, halfLength, heading };
}

describe('satOverlap', () => {
  it('reports no overlap and a zero mtv for rects far apart', () => {
    const a = rect(0, 0, 10, 20);
    const b = rect(500, 500, 10, 20);
    const result = satOverlap(a, b);
    expect(result.overlap).toBe(false);
    expect(result.mtv).toEqual({ x: 0, y: 0 });
  });

  it('detects overlap between two axis-aligned rects and gives an mtv that separates them', () => {
    const a = rect(0, 0, 10, 20);
    const b = rect(15, 0, 10, 20); // 5px of overlap along x
    const result = satOverlap(a, b);

    expect(result.overlap).toBe(true);
    expect(result.mtv.y).toBeCloseTo(0, 10);
    expect(result.mtv.x).toBeCloseTo(-5, 10); // push `a` away from `b`, to the left

    const separated = { x: a.x + result.mtv.x, y: a.y + result.mtv.y };
    expect(satOverlap({ ...a, ...separated }, b).overlap).toBe(false);
  });

  it('treats exactly-touching rects as not overlapping', () => {
    const a = rect(0, 0, 10, 20);
    const b = rect(20, 0, 10, 20); // bumpers exactly meet, zero penetration
    expect(satOverlap(a, b).overlap).toBe(false);
  });

  it('accounts for rotation when testing overlap', () => {
    // b is long and thin (halfWidth 5, halfLength 40), offset 30px along x
    // from a. Facing straight ahead, its narrow side faces `a` and there's no
    // overlap; rotated 90°, its long side swings around to reach `a`.
    const a = rect(0, 0, 10, 10);
    const unrotatedB = rect(30, 0, 5, 40);
    const rotatedB = rect(30, 0, 5, 40, Math.PI / 2);

    expect(satOverlap(a, unrotatedB).overlap).toBe(false);
    expect(satOverlap(a, rotatedB).overlap).toBe(true);
  });
});

describe('satOverlapInflated', () => {
  it('is true when rects are within the margin but not touching', () => {
    const a = rect(0, 0, 10, 20);
    const b = rect(28, 0, 10, 20); // 8px gap between edges
    expect(satOverlap(a, b).overlap).toBe(false);
    expect(satOverlapInflated(a, b, 12)).toBe(true);
  });

  it('is false when rects are further apart than the margin', () => {
    const a = rect(0, 0, 10, 20);
    const b = rect(50, 0, 10, 20); // 30px gap between edges
    expect(satOverlapInflated(a, b, 12)).toBe(false);
  });
});

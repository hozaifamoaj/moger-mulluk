// §8 Collision and Damage: rotated-rectangle separating-axis test. The spec
// explicitly calls for hand-written SAT ("about 100 lines") rather than
// Phaser Arcade physics, because Arcade bodies can't rotate.

export interface RotatedRect {
  x: number;
  y: number;
  halfWidth: number; // local x half-extent (side-to-side)
  halfLength: number; // local y half-extent (front-to-back)
  heading: number; // radians; 0 = facing -y, per src/sim/vehicle.ts
}

export interface SatResult {
  overlap: boolean;
  // Minimum translation vector: moving `a` by this vector separates it from
  // `b` along the axis of least penetration. Zero vector when not overlapping.
  mtv: { x: number; y: number };
}

interface Axis {
  x: number;
  y: number;
}

function dot(a: Axis, b: Axis): number {
  return a.x * b.x + a.y * b.y;
}

// Side axis (width direction) and forward axis (length direction). Heading 0
// moves along -y with width along x (src/sim/vehicle.ts), so these are the
// rect's local x/y axes rotated by heading. Exported for circleOverlapsRect.
export function axes(rect: RotatedRect): [Axis, Axis] {
  const cos = Math.cos(rect.heading);
  const sin = Math.sin(rect.heading);
  return [
    { x: cos, y: sin },
    { x: -sin, y: cos },
  ];
}

function projectedHalfExtent(rect: RotatedRect, rectAxes: [Axis, Axis], onAxis: Axis): number {
  return Math.abs(rect.halfWidth * dot(rectAxes[0], onAxis)) + Math.abs(rect.halfLength * dot(rectAxes[1], onAxis));
}

/** SAT overlap test for two rotated rectangles, with a push-apart MTV. */
export function satOverlap(a: RotatedRect, b: RotatedRect): SatResult {
  const aAxes = axes(a);
  const bAxes = axes(b);
  const candidateAxes = [...aAxes, ...bAxes];

  const dx = b.x - a.x;
  const dy = b.y - a.y;

  let minOverlap = Infinity;
  let minAxis: Axis = { x: 0, y: 0 };

  for (const axis of candidateAxes) {
    const ra = projectedHalfExtent(a, aAxes, axis);
    const rb = projectedHalfExtent(b, bAxes, axis);
    const centerDistance = dx * axis.x + dy * axis.y;
    const overlap = ra + rb - Math.abs(centerDistance);

    if (overlap <= 0) {
      return { overlap: false, mtv: { x: 0, y: 0 } };
    }

    if (overlap < minOverlap) {
      minOverlap = overlap;
      // Push `a` away from `b`: opposite the sign of centerDistance along this axis.
      const sign = centerDistance >= 0 ? -1 : 1;
      minAxis = { x: axis.x * sign, y: axis.y * sign };
    }
  }

  return { overlap: true, mtv: { x: minAxis.x * minOverlap, y: minAxis.y * minOverlap } };
}

/**
 * Overlap test on both rectangles inflated by `margin` on every side — used
 * to detect "passing within `margin`px without touching" (§8 near miss) by
 * reusing `satOverlap` rather than separate closest-point geometry.
 */
export function satOverlapInflated(a: RotatedRect, b: RotatedRect, margin: number): boolean {
  const half = margin / 2;
  const inflated = (rect: RotatedRect): RotatedRect => ({
    ...rect,
    halfWidth: rect.halfWidth + half,
    halfLength: rect.halfLength + half,
  });
  return satOverlap(inflated(a), inflated(b)).overlap;
}

export interface Circle {
  x: number;
  y: number;
  radius: number;
}

/**
 * §6/§8: pedestrians are circles, not rectangles, so the player-vs-pedestrian
 * hit check can't reuse satOverlap directly. Standard closest-point-on-OBB
 * test: rotate the circle's center into the rectangle's local space, clamp
 * to its half-extents, and compare the remaining distance to the radius.
 */
export function circleOverlapsRect(circle: Circle, rect: RotatedRect): boolean {
  const [sideAxis, forwardAxis] = axes(rect);
  const dx = circle.x - rect.x;
  const dy = circle.y - rect.y;

  const localX = dot({ x: dx, y: dy }, sideAxis);
  const localY = dot({ x: dx, y: dy }, forwardAxis);

  const clampedX = Math.min(Math.max(localX, -rect.halfWidth), rect.halfWidth);
  const clampedY = Math.min(Math.max(localY, -rect.halfLength), rect.halfLength);

  const distX = localX - clampedX;
  const distY = localY - clampedY;
  return distX * distX + distY * distY <= circle.radius * circle.radius;
}

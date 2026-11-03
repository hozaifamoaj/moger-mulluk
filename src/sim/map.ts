// §7.2–7.3: route/map data. Pure data model, a validator that gives clear
// errors, and a RouteMap that answers position-based queries (lane count,
// divider gaps, jam/police/wrong-way zones, bus stops, parked vehicles) used
// by traffic, the spawner and the player's road-contact check. No Phaser or
// browser APIs here (rule 2) — the scene loads the JSON and hands the parsed
// value to `validateSegments`.
import { TRAFFIC, MAP_PLACEMENT } from './config';
import { computeRoadEdges } from './road';

export type SpawnableTrafficType = 'car' | 'bus' | 'rickshaw' | 'cng' | 'motorcycle';
export const SPAWNABLE_TYPES: readonly SpawnableTrafficType[] = ['car', 'bus', 'rickshaw', 'cng', 'motorcycle'];

export interface BusStopFeature {
  type: 'busStop';
  at: number;
}
export interface CrossingFeature {
  type: 'crossing';
  at: number;
  overbridge?: boolean;
}
export interface ParkedFeature {
  type: 'parked';
  at: number;
  side: 'left' | 'right';
  count: number;
}
export interface DividerGapFeature {
  type: 'dividerGap';
  at: number;
  length: number;
}
export interface PoliceFeature {
  type: 'police';
  from: number;
  to: number;
}
export interface JamFeature {
  type: 'jam';
  from: number;
  to: number;
}
export interface WrongWayFeature {
  type: 'wrongWay';
  from: number;
  to: number;
}

export type SegmentFeature =
  | BusStopFeature
  | CrossingFeature
  | ParkedFeature
  | DividerGapFeature
  | PoliceFeature
  | JamFeature
  | WrongWayFeature;

export interface Segment {
  id: string;
  length: number;
  lanes: 2 | 3;
  divider: boolean;
  density: 'low' | 'medium' | 'high';
  spawn: Partial<Record<SpawnableTrafficType, number>>;
  features: SegmentFeature[];
}

export type ValidationResult = { valid: true; segments: Segment[] } | { valid: false; errors: string[] };

const FEATURE_TYPES = ['busStop', 'crossing', 'parked', 'dividerGap', 'police', 'jam', 'wrongWay'] as const;

/** Validates raw parsed JSON into typed `Segment[]`, collecting every error rather than throwing on the first. */
export function validateSegments(raw: unknown): ValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(raw) || raw.length === 0) {
    return { valid: false, errors: ['map must be a non-empty array of segments'] };
  }

  raw.forEach((item, i) => validateSegment(item, `segment[${i}]`, errors));

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, segments: raw as Segment[] };
}

function validateSegment(item: unknown, prefix: string, errors: string[]): void {
  if (typeof item !== 'object' || item === null) {
    errors.push(`${prefix}: must be an object`);
    return;
  }
  const s = item as Record<string, unknown>;

  if (typeof s.id !== 'string' || s.id.length === 0) errors.push(`${prefix}.id: must be a non-empty string`);
  if (typeof s.length !== 'number' || !(s.length > 0)) errors.push(`${prefix}.length: must be a positive number`);
  if (s.lanes !== 2 && s.lanes !== 3) errors.push(`${prefix}.lanes: must be 2 or 3`);
  if (typeof s.divider !== 'boolean') errors.push(`${prefix}.divider: must be a boolean`);
  if (s.density !== 'low' && s.density !== 'medium' && s.density !== 'high') {
    errors.push(`${prefix}.density: must be "low", "medium" or "high"`);
  }

  if (typeof s.spawn !== 'object' || s.spawn === null) {
    errors.push(`${prefix}.spawn: must be an object`);
  } else {
    for (const [key, value] of Object.entries(s.spawn as Record<string, unknown>)) {
      if (!SPAWNABLE_TYPES.includes(key as SpawnableTrafficType)) {
        errors.push(`${prefix}.spawn.${key}: unknown traffic type`);
      } else if (typeof value !== 'number' || value < 0) {
        errors.push(`${prefix}.spawn.${key}: must be a non-negative number`);
      }
    }
  }

  const segmentLength = typeof s.length === 'number' ? s.length : Infinity;
  if (!Array.isArray(s.features)) {
    errors.push(`${prefix}.features: must be an array`);
  } else {
    s.features.forEach((feature, j) => validateFeature(feature, `${prefix}.features[${j}]`, segmentLength, errors));
  }
}

function validateFeature(feature: unknown, prefix: string, segmentLength: number, errors: string[]): void {
  if (typeof feature !== 'object' || feature === null) {
    errors.push(`${prefix}: must be an object`);
    return;
  }
  const f = feature as Record<string, unknown>;

  if (!FEATURE_TYPES.includes(f.type as (typeof FEATURE_TYPES)[number])) {
    errors.push(`${prefix}.type: unknown feature type "${String(f.type)}"`);
    return;
  }

  const checkAt = (): void => {
    if (typeof f.at !== 'number' || f.at < 0 || f.at > segmentLength) {
      errors.push(`${prefix}.at: must be a number between 0 and the segment length`);
    }
  };
  const checkRange = (): void => {
    if (
      typeof f.from !== 'number' ||
      typeof f.to !== 'number' ||
      !(f.from < f.to) ||
      f.from < 0 ||
      f.to > segmentLength
    ) {
      errors.push(`${prefix}: "from" must be less than "to", both within the segment length`);
    }
  };

  switch (f.type) {
    case 'busStop':
      checkAt();
      break;
    case 'crossing':
      checkAt();
      if (f.overbridge !== undefined && typeof f.overbridge !== 'boolean') {
        errors.push(`${prefix}.overbridge: must be a boolean`);
      }
      break;
    case 'parked':
      checkAt();
      if (f.side !== 'left' && f.side !== 'right') errors.push(`${prefix}.side: must be "left" or "right"`);
      if (typeof f.count !== 'number' || f.count < 1) errors.push(`${prefix}.count: must be at least 1`);
      break;
    case 'dividerGap':
      checkAt();
      if (typeof f.length !== 'number' || !(f.length > 0)) errors.push(`${prefix}.length: must be a positive number`);
      break;
    case 'police':
    case 'jam':
    case 'wrongWay':
      checkRange();
      break;
  }
}

export interface ParkedVehicle {
  x: number;
  y: number;
  width: number;
  length: number;
}

export interface CrossingZone {
  y: number;
  overbridge: boolean;
}

export interface WaitingPassenger {
  x: number;
  y: number;
}

interface AbsoluteRange {
  from: number; // larger y: the segment-start side
  to: number; // smaller y: the finish side
}

export interface SegmentRange {
  topY: number;
  bottomY: number;
  segment: Segment;
}

/**
 * Lays out validated segments back-to-back along y, the first segment
 * starting at `totalLength` (the furthest point from the finish) and the
 * last ending at 0 (the finish). Converts every feature's segment-relative
 * offset into an absolute y so the rest of the sim only ever deals in one
 * coordinate space (rule 7).
 */
export class RouteMap {
  readonly totalLength: number;
  readonly busStops: readonly number[];
  readonly parkedVehicles: readonly ParkedVehicle[];
  readonly crossings: readonly CrossingZone[];
  readonly waitingPassengers: readonly WaitingPassenger[];

  // Public so the presentation layer can draw each segment at its own lane
  // width (the 3-to-2-lane merge, §7.2) without duplicating this layout math.
  readonly segmentRanges: SegmentRange[] = [];
  private readonly dividerGaps: AbsoluteRange[] = [];
  private readonly policeZones: AbsoluteRange[] = [];
  private readonly jamZones: AbsoluteRange[] = [];
  private readonly wrongWayZones: AbsoluteRange[] = [];

  constructor(segments: readonly Segment[]) {
    let topY = segments.reduce((sum, s) => sum + s.length, 0);
    this.totalLength = topY;

    const busStops: number[] = [];
    const parked: ParkedVehicle[] = [];
    const crossings: CrossingZone[] = [];
    const waitingPassengers: WaitingPassenger[] = [];

    for (const segment of segments) {
      const bottomY = topY - segment.length;
      this.segmentRanges.push({ topY, bottomY, segment });

      for (const feature of segment.features) {
        switch (feature.type) {
          case 'busStop': {
            const stopY = topY - feature.at;
            busStops.push(stopY);

            // §6 "waiting passengers": no count or exact placement rule is
            // given beyond "outer edge of the road" — see MAP_PLACEMENT's
            // TODO(tune) comment.
            const stopEdges = computeRoadEdges(segment.lanes);
            const passengerX = stopEdges.footpathPlayerRightX + MAP_PLACEMENT.waitingPassengerMargin;
            for (let i = 0; i < MAP_PLACEMENT.waitingPassengerCount; i++) {
              waitingPassengers.push({ x: passengerX, y: stopY - i * MAP_PLACEMENT.waitingPassengerSpacing });
            }
            break;
          }
          case 'dividerGap': {
            const centerY = topY - feature.at;
            this.dividerGaps.push({ from: centerY + feature.length / 2, to: centerY - feature.length / 2 });
            break;
          }
          case 'police':
            this.policeZones.push({ from: topY - feature.from, to: topY - feature.to });
            break;
          case 'jam':
            this.jamZones.push({ from: topY - feature.from, to: topY - feature.to });
            break;
          case 'wrongWay':
            this.wrongWayZones.push({ from: topY - feature.from, to: topY - feature.to });
            break;
          case 'parked': {
            const edges = computeRoadEdges(segment.lanes);
            const config = TRAFFIC.parked;
            const x =
              feature.side === 'left'
                ? edges.footpathPlayerRightX + config.width / 2 + MAP_PLACEMENT.parkedMargin
                : edges.dividerLeftX - config.width / 2 - MAP_PLACEMENT.parkedMargin;
            const startY = topY - feature.at;
            for (let i = 0; i < feature.count; i++) {
              parked.push({
                x,
                y: startY - i * (config.length + MAP_PLACEMENT.parkedSpacing),
                width: config.width,
                length: config.length,
              });
            }
            break;
          }
          case 'crossing':
            crossings.push({ y: topY - feature.at, overbridge: feature.overbridge ?? false });
            break;
        }
      }

      topY = bottomY;
    }

    this.busStops = busStops;
    this.parkedVehicles = parked;
    this.crossings = crossings;
    this.waitingPassengers = waitingPassengers;
  }

  private segmentAt(y: number): SegmentRange {
    const found = this.segmentRanges.find((r) => y <= r.topY && y >= r.bottomY);
    return found ?? this.segmentRanges[this.segmentRanges.length - 1];
  }

  laneCountAt(y: number): 2 | 3 {
    return this.segmentAt(y).segment.lanes;
  }

  spawnTableAt(y: number): { type: SpawnableTrafficType; count: number }[] {
    const spawn = this.segmentAt(y).segment.spawn;
    return SPAWNABLE_TYPES.map((type) => ({ type, count: spawn[type] ?? 0 })).filter((entry) => entry.count > 0);
  }

  targetActiveCountAt(y: number): number {
    return this.spawnTableAt(y).reduce((sum, entry) => sum + entry.count, 0);
  }

  dividerGapAt(y: number): boolean {
    return this.dividerGaps.some((r) => y <= r.from && y >= r.to);
  }

  policeZoneAt(y: number): boolean {
    return this.policeZones.some((r) => y <= r.from && y >= r.to);
  }

  jamSpeedCapAt(y: number): boolean {
    return this.jamZones.some((r) => y <= r.from && y >= r.to);
  }

  wrongWayZoneAt(y: number): boolean {
    return this.wrongWayZones.some((r) => y <= r.from && y >= r.to);
  }
}

/** A single long flat segment with no features — used by tests and as a safe fallback. */
export function createDefaultTestMap(): RouteMap {
  return new RouteMap([
    {
      id: 'test-straight',
      length: 20000,
      lanes: 3,
      divider: true,
      density: 'medium',
      spawn: { car: 10, bus: 6 },
      features: [],
    },
  ]);
}

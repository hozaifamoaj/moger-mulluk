// §3.2 Controls, lifted to a device-agnostic shape. The presentation layer
// (keyboard, touch) maps raw input into this each frame; the sim only ever
// sees this interface.
export interface Input {
  throttle: 0 | 1;
  brake: 0 | 1;
  steer: -1 | 0 | 1;
  horn: boolean;
}

// §4.2/§4.3 Vehicle config, mirrored from the spec's VehicleConfig interface.
export interface VehicleConfig {
  id: string;
  name: string;
  maxSpeed: number; // px/s
  reverseMax: number; // px/s
  acceleration: number; // px/s²
  braking: number; // px/s²
  steerRate: number; // deg/s
  width: number; // px
  length: number; // px
  health: number;
}

// Kinematic + damage state for the player's vehicle.
export interface PlayerVehicleState {
  x: number;
  y: number;
  heading: number; // radians; 0 = straight ahead (toward -y, per rule 7)
  speed: number; // px/s; positive forward, negative reverse
  health: number;
  // Seconds remaining before another kerb/divider contact can cost health
  // (§8.1's 0.5s cooldown). Push-back and speed loss still apply every step
  // while in contact; only the health deduction is gated by this.
  kerbCooldown: number;
  // §3.4 / §9: whether the player is currently inside a police zone while on
  // the footpath or the wrong side of the divider. Debounced so a `fine`
  // event fires once on entry into the violation, not every step it holds.
  fineActive: boolean;
}

// CLAUDE.md rule 8: the sim emits events; HUD/audio/scenes react to them and
// never mutate sim state directly. More event types arrive with
// scoring and the finish line in later milestones.
export type SimEventType =
  | 'kerbContact'
  | 'dividerContact'
  | 'vehicleCollision'
  | 'nearMiss'
  | 'fine'
  | 'pedestrianHit'
  | 'hornUsed'
  | 'finish'
  | 'fail';

// §8.1 collision classes, by relative speed at impact.
export type CollisionClass = 'scrape' | 'collision' | 'highSpeed';

// §3.4: which rule a `fine` event was triggered by.
export type FineReason = 'footpath' | 'wrongSide';

// §3.1 Fail conditions.
export type FailReason = 'time' | 'wrecked' | 'pedestrian';

export interface SimEvent {
  type: SimEventType;
  healthLost: number;
  // Present only on 'vehicleCollision' events.
  collisionClass?: CollisionClass;
  // Present on 'vehicleCollision' and 'nearMiss' events: the pool index of
  // the traffic vehicle involved.
  trafficId?: number;
  // Present only on 'fine' events.
  fineReason?: FineReason;
  // Present only on 'pedestrianHit' events: the pool index of the pedestrian involved.
  pedestrianId?: number;
  // Present only on 'fail' events.
  failReason?: FailReason;
}

// §5.2 Traffic types. Rickshaw/CNG/motorcycle/parked arrive M4.
export type TrafficVehicleType = 'car' | 'bus' | 'rickshaw' | 'cng' | 'motorcycle' | 'parked';

export interface TrafficVehicleConfig {
  id: TrafficVehicleType;
  speedMin: number; // px/s
  speedMax: number; // px/s
  width: number; // px
  length: number; // px
}

// One slot in the traffic pool. `active` marks whether it currently
// represents a live vehicle on the road; inactive slots are reused by the
// spawner (CLAUDE.md rule 10: pool, don't reallocate).
export interface TrafficVehicleState {
  active: boolean;
  type: TrafficVehicleType;
  x: number;
  y: number;
  speed: number; // px/s, current actual forward speed (may be below cruiseSpeed while keeping distance)
  cruiseSpeed: number; // px/s, picked once at spawn within the type's range (§5.2); the speed resumed once unobstructed
  width: number;
  length: number;
  // §8.1: seconds remaining for which this vehicle ignores its normal rules
  // after being hit (it stops, then resumes).
  stopTimer: number;
  // §5.2 car/CNG sideways shift: a scripted-point placeholder (see
  // CAR_SIDEWAYS_SHIFT/CNG_CUTIN in config.ts). `remainingTriggerDistance`
  // counts down px of forward travel before the shift is attempted; once
  // triggered, `progress` tracks px of `magnitude` completed. For cars,
  // `side`/`magnitude` are rolled at spawn; for CNGs they start at 0 and are
  // resolved at trigger time by searching CNG_CUTIN.offsets for a clear gap.
  // Null once resolved (done, skipped because blocked, or not applicable to
  // this type).
  sidewaysShift: {
    remainingTriggerDistance: number;
    magnitude: number;
    side: -1 | 1;
    progress: number;
    // px/s for this particular shift. Scripted car/CNG shifts move at
    // TRAFFIC_RULES.sidewaysMoveSpeed; the horn-triggered rickshaw shift
    // (§3.3) moves faster, over a fixed 0.5s regardless of magnitude.
    speed: number;
  } | null;
  // §5.2 rickshaw/motorcycle continuous sideways drift: a sine wave around a
  // fixed base x (distinct from the one-shot `sidewaysShift` above). Null for
  // types that don't drift, and for wrong-way motorcycles (direction === -1),
  // which move in a straight line.
  drift: { baseX: number; phase: number } | null;
  // §5.2: normal traffic (toward -y, same direction as the player) is 1;
  // wrong-way motorcycles inside a map wrongWay zone (toward +y, head-on
  // with the player) are -1.
  direction: 1 | -1;
  // §5.2/§5.4: absolute y of the bus stop this bus has already dwelled at,
  // so it doesn't re-trigger `stopTimer` every step it's stopped there. Null
  // for non-buses and buses that haven't stopped yet.
  lastBusStopY: number | null;
  // §8 near miss: each traffic vehicle can give at most one, ever.
  nearMissGiven: boolean;
}

// §6 Pedestrians. Pool-friendly like TrafficVehicleState (rule 10): a fixed
// array of slots, `active` marking which currently represent a live
// pedestrian.
export type PedestrianPhase = 'waiting' | 'walking' | 'stoppedMidway';

export interface PedestrianState {
  active: boolean;
  // Index into RouteMap.crossings this pedestrian belongs to, used for the
  // §6 per-zone cap (max 3 on the road at once). -1 for waiting bus-stop
  // passengers, which aren't tied to a crossing zone.
  crossingIndex: number;
  // §6 "waiting passengers": static obstacles placed once at bus stops.
  // Always stays in 'waiting' with an infinite waitTimer; stepPedestrians
  // skips these entirely.
  isWaitingPassenger: boolean;
  // §6: drawn on the overbridge; never a collision target or a traffic
  // keep-distance obstacle, and excluded from the per-zone road cap.
  usesOverbridge: boolean;
  phase: PedestrianPhase;
  x: number;
  y: number; // fixed for the pedestrian's lifetime; crossing movement is in x only
  startX: number;
  targetX: number;
  speed: number; // px/s, rolled at spawn within PEDESTRIAN.speedMin/speedMax
  // Seconds remaining on the footpath before stepping out (phase === 'waiting').
  // §3.3 horn: a honk inside the horn zone adds HORN.pedestrianWaitExtensionSeconds.
  waitTimer: number;
  // x at which this pedestrian pauses once reached, rolled at spawn (§6: 25%
  // chance); null if this pedestrian never stops midway.
  midwayStopX: number | null;
  hasStoppedMidway: boolean;
  // Seconds remaining of the midway pause (phase === 'stoppedMidway').
  stopTimer: number;
  // Seconds remaining of a horn-triggered 1.5x walking-speed boost (§3.3).
  speedBoostTimer: number;
}

export interface SimState {
  stepCount: number;
  elapsedSeconds: number;
  player: PlayerVehicleState;
  traffic: readonly TrafficVehicleState[];
  pedestrians: readonly PedestrianState[];
  // §8.1: seconds remaining of player invulnerability after a vehicle
  // collision (no further damage/points; sprite blinks).
  invulnerability: number;
  // §8: near misses counted so far this run, capped at NEAR_MISS.cap.
  nearMissCount: number;
  // §3.3: seconds remaining before the horn can be used again.
  hornCooldown: number;
  // §9: running score total, including the finish/time bonus once won.
  score: number;
  // §10.2 Results screen tallies, not otherwise derivable from `score` alone.
  collisionCount: number;
  fineCount: number;
  // §3.1/§3.5: once this leaves 'playing', `Sim.step` freezes state and stops
  // emitting events — the presentation layer is expected to stop calling
  // `step` and transition to the Results screen instead.
  runStatus: 'playing' | 'finished' | 'failed';
  failReason: FailReason | null;
  // §9: 0 until finished (a failed run has no stars, per §9/§16: "failed run,
  // score is not saved"); 1-3 once finished, per SCORING's thresholds.
  stars: 0 | 1 | 2 | 3;
}

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
}

// CLAUDE.md rule 8: the sim emits events; HUD/audio/scenes react to them and
// never mutate sim state directly. More event types arrive with
// pedestrians, scoring and the finish line in later milestones.
export type SimEventType = 'kerbContact' | 'dividerContact' | 'vehicleCollision' | 'nearMiss';

// §8.1 collision classes, by relative speed at impact.
export type CollisionClass = 'scrape' | 'collision' | 'highSpeed';

export interface SimEvent {
  type: SimEventType;
  healthLost: number;
  // Present only on 'vehicleCollision' events.
  collisionClass?: CollisionClass;
  // Present on 'vehicleCollision' and 'nearMiss' events: the pool index of
  // the traffic vehicle involved.
  trafficId?: number;
}

// §5.2 Traffic types in M3 scope. Rickshaw/CNG/motorcycle/parked arrive M4.
export type TrafficVehicleType = 'car' | 'bus';

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
  // §5.2 car-only sideways shift: a scripted-point placeholder (see
  // CAR_SIDEWAYS_SHIFT in config.ts). `remainingTriggerDistance` counts down
  // px of forward travel before the shift is attempted; once triggered,
  // `progress` tracks px of `magnitude` completed. Null once resolved
  // (done, skipped because blocked, or not applicable to this type).
  sidewaysShift: {
    remainingTriggerDistance: number;
    magnitude: number;
    side: -1 | 1;
    progress: number;
  } | null;
  // §8 near miss: each traffic vehicle can give at most one, ever.
  nearMissGiven: boolean;
}

export interface SimState {
  stepCount: number;
  elapsedSeconds: number;
  player: PlayerVehicleState;
  traffic: readonly TrafficVehicleState[];
  // §8.1: seconds remaining of player invulnerability after a vehicle
  // collision (no further damage/points; sprite blinks).
  invulnerability: number;
  // §8: near misses counted so far this run, capped at NEAR_MISS.cap.
  nearMissCount: number;
}

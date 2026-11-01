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
// never mutate sim state directly. More event types arrive with traffic,
// pedestrians, scoring and the finish line in later milestones.
export type SimEventType = 'kerbContact' | 'dividerContact';

export interface SimEvent {
  type: SimEventType;
  healthLost: number;
}

export interface SimState {
  stepCount: number;
  elapsedSeconds: number;
  player: PlayerVehicleState;
}

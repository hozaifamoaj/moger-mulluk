// §12.8 Display: logical resolution, scaled to fit.
export const DISPLAY = {
  width: 720,
  height: 1280,
} as const;

// §12.6 Saved data: every localStorage key is prefixed with this.
export const STORAGE_PREFIX = 'mm.';

// §12.4 Game loop: fixed simulation step, and the cap on accumulated frame
// time after a long pause (e.g. a hidden tab) so the sim doesn't try to
// "catch up" through thousands of steps at once.
export const SIM = {
  stepSeconds: 1 / 60,
  maxFrameDeltaMs: 250,
} as const;

// §4.2 Vehicles: provisional values, starting points for playtesting.
// `braking` and `reverseMax` are not given in §4.2's table (only maxSpeed,
// acceleration, steering and size/health are specified there) — these two
// are guesses pending tuning.
export const VEHICLES = {
  car: {
    id: 'car',
    name: 'Car',
    maxSpeed: 420, // px/s
    reverseMax: 168, // px/s — TODO(tune): not given in §4.2; set to 40% of maxSpeed
    acceleration: 260, // px/s²
    braking: 520, // px/s² — TODO(tune): not given in §4.2; set to 2x acceleration
    steerRate: 150, // deg/s
    width: 36, // px
    length: 72, // px
    health: 100,
  },
} as const;

// §4.3 Movement: steering weakens as speed rises. The spec describes this
// qualitatively but gives no falloff curve, so turnFactor(speed) is a linear
// ramp from 0 at a standstill (no turning while stationary, per §4.3) down to
// minTurnFactor at maxSpeed. TODO(tune): the curve shape and floor value.
export const STEERING = {
  minTurnFactor: 0.4,
} as const;

// §7.1 Road geometry, left to right. This is the straight-road prototype
// cross-section (Prototype 0.1, §15); per-segment width changes (e.g. the
// 3-to-2-lane merge) arrive with route/map data in M4.
export const ROAD = {
  footpathWidth: 60,
  laneWidth: 90,
  playerLanes: 3, // 270 px
  dividerWidth: 20,
  oppositeLanes: 2, // 180 px
  // Prototype straight-road length for greybox rendering; replaced by real
  // route segments (§7.2) in M4.
  length: 20000,
} as const;

// §8 Collision and Damage; §8.1 Collision response — kerb and divider contact
// only. Vehicle/pedestrian collision classes (scrape/collision/high-speed)
// arrive with traffic and pedestrians in M3/M5/M6.
export const COLLISION = {
  kerbHealthLoss: 5,
  kerbSpeedMultiplier: 0.5, // car keeps 50% of its speed on kerb/divider contact
  kerbHealthSpeedThreshold: 0.3, // health only drops if speed was above 30% of top speed
  kerbCooldownSeconds: 0.5, // between health-affecting kerb/divider hits
} as const;

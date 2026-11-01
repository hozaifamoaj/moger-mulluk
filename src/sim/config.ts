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

// §5.2 Traffic rules by type — car and bus only (M3 scope). Car width/length
// match VEHICLES.car exactly, per the spec's own table. Bus dwell-at-bus-stop
// behaviour needs map data (M4) and isn't modelled yet.
export const TRAFFIC = {
  car: {
    id: 'car',
    speedMin: 220, // px/s
    speedMax: 280, // px/s
    width: 36, // px
    length: 72, // px
  },
  bus: {
    id: 'bus',
    speedMin: 160, // px/s
    speedMax: 200, // px/s
    width: 60, // px
    length: 150, // px
  },
} as const;

// §5.1 Shared traffic rules.
export const TRAFFIC_RULES = {
  keepDistanceLookAhead: 120, // px ahead of the front bumper
  keepDistanceGap: 30, // px gap to maintain once matched
  keepDistanceMaxDecel: 400, // px/s² max deceleration while closing the gap
  sidewaysMoveSpeed: 60, // px/s for any scripted sideways move
  sidewaysClearanceMargin: 30, // px required clear, front and back, for a sideways move
} as const;

// §5.2 Car-only sideways shift. §7.3's scripted-point map data doesn't exist
// until M4, so for M3's plain straight road each spawned car independently
// rolls (via the seeded RNG) one forward offset, side and magnitude at which
// it attempts its single shift — a placeholder for real scripted points.
// TODO(tune): replaced by per-segment scripted data in M4.
export const CAR_SIDEWAYS_SHIFT = {
  minMagnitude: 30, // px
  maxMagnitude: 60, // px
  minTriggerDistance: 400, // px travelled before the shift is attempted
  maxTriggerDistance: 2000, // px
} as const;

// §5.3 Spawning and density. No per-segment spawn table exists until M4, so
// M3 uses one flat target pool size and a car:bus mix.
// TODO(tune): both the density level and the car:bus ratio are guesses
// pending real segment data and playtesting.
export const SPAWN = {
  targetActiveCount: 16, // §5.3 "medium" density
  carRatio: 2 / 3, // ~2:1 car:bus mix
  poolCapacity: 40, // fixed pool size; must exceed targetActiveCount with margin
  aheadOfPlayerDistance: 1600, // px: far edge of the spawn window ahead of the player
  offscreenSpawnDistance: 900, // px: steady-state spawns stay beyond ~896px visible (DISPLAY.height * 0.7), so nothing pops into view
  behindPlayerDespawnDistance: 600, // px: despawn once this far behind the player
} as const;

// §8 / §8.1 Vehicle-vs-vehicle collision (player vs traffic only — traffic
// has no health field in the spec, and the keep-distance rule is relied on
// to prevent traffic-vs-traffic overlap).
export const VEHICLE_COLLISION = {
  scrapeSpeedThreshold: 80, // px/s relative speed, below = scrape
  highSpeedThreshold: 250, // px/s relative speed, above = high-speed collision
  scrapeHealthLoss: 5,
  collisionHealthLoss: 15,
  highSpeedHealthLoss: 30,
  scrapeSpeedMultiplier: 0.7, // player keeps 70% of speed on a scrape
  collisionSpeedMultiplier: 0.3, // player keeps 30% of speed on collision/high-speed
  hitVehiclePauseSeconds: 1, // the traffic vehicle that was hit stops for this long
  invulnerabilitySeconds: 1, // player takes no further damage/points during this window
  lowHealthThreshold: 0.5, // below 50% health...
  lowHealthSpeedMultiplier: 0.8, // ...top speed drops by 20%
} as const;

// §8 Near miss.
export const NEAR_MISS = {
  distance: 12, // px gap counted as a near miss
  speedThreshold: 0.6, // player speed must exceed 60% of its own maxSpeed
  cap: 40, // per run
} as const;

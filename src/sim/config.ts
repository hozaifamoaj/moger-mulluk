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

// §5.2 Traffic rules by type. Car width/length match VEHICLES.car exactly,
// per the spec's own table.
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
  rickshaw: {
    id: 'rickshaw',
    speedMin: 60, // px/s
    speedMax: 80, // px/s
    width: 28, // px
    length: 50, // px
  },
  cng: {
    id: 'cng',
    speedMin: 180, // px/s
    speedMax: 230, // px/s
    width: 32, // px
    length: 56, // px
  },
  motorcycle: {
    id: 'motorcycle',
    speedMin: 280, // px/s
    speedMax: 340, // px/s
    width: 14, // px
    length: 40, // px
  },
  // §5.2: "Car or CNG size" — car size picked as the deterministic default.
  // TODO(tune): no rule is given for which map-placed parked vehicles use
  // which size; revisit once a real map wants to mix the two.
  parked: {
    id: 'parked',
    speedMin: 0, // px/s
    speedMax: 0, // px/s
    width: 36, // px
    length: 72, // px
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

// §5.3 Spawning and density. Per-segment spawn tables (§7.3) now drive type
// mix and target count; this holds only the parts that aren't per-segment.
export const SPAWN = {
  poolCapacity: 60, // fixed pool size; must exceed the busiest segment's target plus parked vehicles and cluster overshoot, with margin
  aheadOfPlayerDistance: 1600, // px: far edge of the spawn window ahead of the player
  offscreenSpawnDistance: 900, // px: steady-state spawns stay beyond ~896px visible (DISPLAY.height * 0.7), so nothing pops into view
  behindPlayerDespawnDistance: 600, // px: despawn once this far behind the player
} as const;

// §5.4: junctions and bus stops marked as jam zones cap traffic speed.
export const JAM = {
  speedCap: 60, // px/s
} as const;

// §5.2: buses stop for a rolled duration at each bus-stop zone.
export const BUS_STOP = {
  minDwellSeconds: 3,
  maxDwellSeconds: 6,
} as const;

// §5.2: rickshaw continuous sideways drift, a sine wave around a fixed base x.
export const RICKSHAW_DRIFT = {
  amplitude: 12, // px
  period: 3, // seconds per full wave
} as const;

// §5.2: motorcycle continuous weave. TODO(tune): the spec says "weaves along
// preset offsets" but gives no amplitude or period; modelled as the same
// kind of sine drift as the rickshaw, with a smaller, faster wave.
export const MOTORCYCLE_WEAVE = {
  amplitude: 25, // px
  period: 2.5, // seconds per full wave
} as const;

// §5.2: inside a map wrongWay zone, motorcycles travel against traffic,
// toward the player, at this fixed speed (not their own speedMin–speedMax).
export const MOTORCYCLE_WRONG_WAY = {
  speed: 200, // px/s
} as const;

// §5.2: CNG scripted-point cut-in. §7.3's segment data has no scripted-point
// feature type, so — same placeholder approach as CAR_SIDEWAYS_SHIFT — each
// spawned CNG independently rolls a forward-travel trigger distance via the
// seeded RNG. At trigger, unlike the car's pre-rolled magnitude/side, it
// searches `offsets` (nearest first) for the first side clear to cut into.
// TODO(tune): replaced by real per-segment scripted points once that map
// data format exists.
export const CNG_CUTIN = {
  minTriggerDistance: 400, // px
  maxTriggerDistance: 2000, // px
  offsets: [-30, 30, -60, 60] as readonly number[], // px, nearest-first
} as const;

// §5.2: rickshaws spawn in clusters rather than individually.
export const RICKSHAW_CLUSTER = {
  minSize: 2,
  maxSize: 4,
  spacing: 40, // px gap beyond each rickshaw's own length between cluster members
} as const;

// §7.3 map-placed parked vehicles: clearance from the kerb/divider line, and
// spacing between consecutive vehicles within the same `parked` feature.
// §6 "waiting passengers" at bus stops are placed the same way, but the spec
// gives no count or exact placement rule beyond "outer edge of the road" —
// the three waitingPassenger* values are TODO(tune).
export const MAP_PLACEMENT = {
  parkedMargin: 10, // px
  parkedSpacing: 10, // px
  waitingPassengerCount: 2, // per bus stop
  waitingPassengerMargin: 14, // px inside the kerb line (PEDESTRIAN.radius + a little clearance)
  waitingPassengerSpacing: 24, // px between consecutive waiting passengers
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

// §6 Pedestrians.
export const PEDESTRIAN = {
  radius: 9, // px
  speedMin: 55, // px/s
  speedMax: 75, // px/s
  spawnIntervalMin: 4, // seconds, per crossing zone
  spawnIntervalMax: 8, // seconds
  maxPerZone: 3, // on the road at once, per crossing zone (overbridge users don't count)
  minWarningSeconds: 1.5, // §6: "at least 1.5 seconds" on the footpath before stepping out
  maxWarningSeconds: 3, // TODO(tune): the spec gives only a minimum
  midwayStopChance: 0.25,
  midwayStopDurationSeconds: 1,
  pairChance: 0.2,
  overbridgeChance: 0.5, // only rolled when the crossing has overbridge: true
  pairYOffset: 10, // px: along-road separation between paired walkers so they don't fully overlap — TODO(tune)
  poolCapacity: 40, // TODO(tune): must exceed (maxPerZone x 2 for pairs) per crossing zone, plus overbridge users and waiting passengers, with margin
} as const;

// §3.3 Horn: affects anything inside a zone ahead of the player, with a
// cooldown so it can't be held down to clear the road.
export const HORN = {
  aheadDistance: 200, // px: zone extends this far ahead of the player
  width: 120, // px: zone width, centered on the player's x
  cooldownSeconds: 2,
  rickshawShiftMagnitude: 20, // px, toward the nearer kerb
  rickshawShiftDurationSeconds: 0.5,
  pedestrianWaitExtensionSeconds: 1, // added to waitTimer for a pedestrian still on the footpath
  pedestrianSpeedBoostMultiplier: 1.5,
  pedestrianSpeedBoostSeconds: 1,
} as const;

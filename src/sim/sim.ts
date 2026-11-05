import type { Input, PedestrianState, SimEvent, SimState, TrafficVehicleState } from './types';
import type { RouteMap } from './map';
import { VEHICLES } from './config';
import { stepVehicle, applyHealthPenalty } from './vehicle';
import {
  resolveRoadContact,
  resolveVehicleCollisions,
  detectNearMisses,
  detectFine,
  detectPedestrianHit,
} from './collision';
import { computeRoadEdges } from './road';
import { createDefaultTestMap } from './map';
import { createTrafficPool, stepTraffic } from './traffic';
import { createPedestrianPool, placeWaitingPassengers, spawnPedestrians, stepPedestrians } from './pedestrian';
import { stepHorn } from './horn';
import { despawnBehindPlayer, fillInitialTraffic, placeParkedVehicles, spawnTraffic } from './spawner';
import { checkFail, checkFinish } from './run';
import { finishBonus, scoreForEvent, starsForScore } from './scoring';
import { Rng } from './rng';

/**
 * Top-level simulation. Owns all sim state and advances it only through
 * `step(dt, input)` at a fixed timestep (§12.4). Presentation code reads
 * `state` and reacts to the events `step` returns; it never mutates state
 * directly (CLAUDE.md rule 8).
 */
export class Sim {
  private readonly _seed: number;
  private readonly _rng: Rng;
  // Mutable pool, same array identity as `_state.traffic` (exposed as
  // `readonly`); traffic/spawner/collision code mutates slots in place
  // rather than reallocating (rule 10).
  private readonly _traffic: TrafficVehicleState[];
  private readonly _pedestrians: PedestrianState[];
  private readonly _pedestrianSpawnTimers: number[];
  private readonly _map: RouteMap;
  private _state: SimState;

  constructor(seed: number, map: RouteMap = createDefaultTestMap(), startY: number = map.totalLength) {
    this._seed = seed;
    this._rng = new Rng(seed);
    this._map = map;

    const edges = computeRoadEdges(map.laneCountAt(startY));
    const startX = (edges.footpathPlayerRightX + edges.dividerLeftX) / 2;

    this._traffic = createTrafficPool();
    placeParkedVehicles(this._traffic, map);
    fillInitialTraffic(
      this._traffic,
      this._rng,
      { x: startX, y: startY, width: VEHICLES.car.width, length: VEHICLES.car.length },
      map,
    );

    this._pedestrians = createPedestrianPool();
    placeWaitingPassengers(this._pedestrians, map);
    this._pedestrianSpawnTimers = new Array(map.crossings.length).fill(0);

    this._state = {
      stepCount: 0,
      elapsedSeconds: 0,
      player: {
        x: startX,
        y: startY,
        heading: 0,
        speed: 0,
        health: VEHICLES.car.health,
        kerbCooldown: 0,
        fineActive: false,
      },
      traffic: this._traffic,
      pedestrians: this._pedestrians,
      invulnerability: 0,
      nearMissCount: 0,
      hornCooldown: 0,
      score: 0,
      collisionCount: 0,
      fineCount: 0,
      runStatus: 'playing',
      failReason: null,
      stars: 0,
    };
  }

  get seed(): number {
    return this._seed;
  }

  get state(): Readonly<SimState> {
    return this._state;
  }

  step(dt: number, input: Input): SimEvent[] {
    // §3.1/§3.5: once the run has ended, freeze state and stop emitting
    // events — the presentation layer is expected to stop calling `step`
    // once it sees a 'finish'/'fail' event and move to the Results screen,
    // but this guard keeps replays/tests safe if it's called anyway.
    if (this._state.runStatus !== 'playing') return [];

    const effectiveConfig = applyHealthPenalty(VEHICLES.car, this._state.player.health);
    const movedPlayer = stepVehicle(this._state.player, input, effectiveConfig, dt);
    const { state: playerAfterRoad, events: roadEvents } = resolveRoadContact(
      movedPlayer,
      VEHICLES.car,
      dt,
      this._map,
    );

    const { hornCooldown, events: hornEvents } = stepHorn(
      input,
      this._state.hornCooldown,
      { x: playerAfterRoad.x, y: playerAfterRoad.y },
      this._traffic,
      this._pedestrians,
      this._map,
      dt,
    );

    const activeIndices: number[] = [];
    for (let i = 0; i < this._traffic.length; i++) {
      if (this._traffic[i].active) activeIndices.push(i);
    }
    activeIndices.sort((a, b) => this._traffic[a].y - this._traffic[b].y);

    stepTraffic(
      this._traffic,
      activeIndices,
      { x: playerAfterRoad.x, y: playerAfterRoad.y, width: VEHICLES.car.width, length: VEHICLES.car.length, speed: playerAfterRoad.speed },
      this._pedestrians,
      dt,
      this._map,
      this._rng,
    );

    stepPedestrians(this._pedestrians, dt);

    const {
      state: playerAfterCollision,
      invulnerability,
      events: collisionEvents,
    } = resolveVehicleCollisions(playerAfterRoad, this._traffic, this._state.invulnerability, VEHICLES.car, dt);

    const { nearMissCount, events: nearMissEvents } = detectNearMisses(
      playerAfterCollision,
      this._traffic,
      VEHICLES.car,
      this._state.nearMissCount,
    );

    const { fineActive, events: fineEvents } = detectFine(playerAfterCollision, VEHICLES.car, this._map);
    const playerAfterFine = { ...playerAfterCollision, fineActive };

    const { events: pedestrianHitEvents } = detectPedestrianHit(playerAfterFine, this._pedestrians, VEHICLES.car);

    despawnBehindPlayer(this._traffic, playerAfterFine.y);
    spawnTraffic(
      this._traffic,
      this._rng,
      { x: playerAfterFine.x, y: playerAfterFine.y, width: VEHICLES.car.width, length: VEHICLES.car.length },
      this._map,
    );
    spawnPedestrians(this._pedestrians, this._rng, this._map, this._pedestrianSpawnTimers, dt);

    const elapsedSeconds = this._state.elapsedSeconds + dt;
    const scoredEvents = [...collisionEvents, ...nearMissEvents, ...fineEvents];
    const scoreDelta = scoredEvents.reduce((sum, event) => sum + scoreForEvent(event), 0);
    const collisionCount =
      this._state.collisionCount + collisionEvents.filter((event) => event.collisionClass !== undefined).length;
    const fineCount = this._state.fineCount + fineEvents.length;

    const pedestrianHitThisStep = pedestrianHitEvents.length > 0;
    const failReason = checkFail(playerAfterFine, elapsedSeconds, pedestrianHitThisStep);
    const finished = failReason === null && checkFinish(playerAfterFine);

    const runStatus = failReason !== null ? 'failed' : finished ? 'finished' : 'playing';
    const score = this._state.score + scoreDelta + (finished ? finishBonus(elapsedSeconds) : 0);
    const stars = finished ? starsForScore(score) : 0;

    const runEvents: SimEvent[] = [];
    if (finished) runEvents.push({ type: 'finish', healthLost: 0 });
    if (failReason !== null) runEvents.push({ type: 'fail', healthLost: 0, failReason });

    this._state = {
      stepCount: this._state.stepCount + 1,
      elapsedSeconds,
      player: playerAfterFine,
      traffic: this._traffic,
      pedestrians: this._pedestrians,
      invulnerability,
      nearMissCount,
      hornCooldown,
      score,
      collisionCount,
      fineCount,
      runStatus,
      failReason,
      stars,
    };

    return [
      ...roadEvents,
      ...hornEvents,
      ...collisionEvents,
      ...nearMissEvents,
      ...fineEvents,
      ...pedestrianHitEvents,
      ...runEvents,
    ];
  }
}

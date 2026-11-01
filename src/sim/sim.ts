import type { Input, SimEvent, SimState, TrafficVehicleState } from './types';
import type { RouteMap } from './map';
import { VEHICLES } from './config';
import { stepVehicle, applyHealthPenalty } from './vehicle';
import { resolveRoadContact, resolveVehicleCollisions, detectNearMisses, detectFine } from './collision';
import { computeRoadEdges } from './road';
import { createDefaultTestMap } from './map';
import { createTrafficPool, stepTraffic } from './traffic';
import { despawnBehindPlayer, fillInitialTraffic, placeParkedVehicles, spawnTraffic } from './spawner';
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
      invulnerability: 0,
      nearMissCount: 0,
    };
  }

  get seed(): number {
    return this._seed;
  }

  get state(): Readonly<SimState> {
    return this._state;
  }

  step(dt: number, input: Input): SimEvent[] {
    const effectiveConfig = applyHealthPenalty(VEHICLES.car, this._state.player.health);
    const movedPlayer = stepVehicle(this._state.player, input, effectiveConfig, dt);
    const { state: playerAfterRoad, events: roadEvents } = resolveRoadContact(
      movedPlayer,
      VEHICLES.car,
      dt,
      this._map,
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
      dt,
      this._map,
      this._rng,
    );

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

    despawnBehindPlayer(this._traffic, playerAfterFine.y);
    spawnTraffic(
      this._traffic,
      this._rng,
      { x: playerAfterFine.x, y: playerAfterFine.y, width: VEHICLES.car.width, length: VEHICLES.car.length },
      this._map,
    );

    this._state = {
      stepCount: this._state.stepCount + 1,
      elapsedSeconds: this._state.elapsedSeconds + dt,
      player: playerAfterFine,
      traffic: this._traffic,
      invulnerability,
      nearMissCount,
    };

    return [...roadEvents, ...collisionEvents, ...nearMissEvents, ...fineEvents];
  }
}

import type { Input, SimEvent, SimState } from './types';
import { VEHICLES } from './config';
import { stepVehicle } from './vehicle';
import { resolveRoadContact } from './collision';
import { computeRoadEdges } from './road';

/**
 * Top-level simulation. Owns all sim state and advances it only through
 * `step(dt, input)` at a fixed timestep (§12.4). Presentation code reads
 * `state` and reacts to the events `step` returns; it never mutates state
 * directly (CLAUDE.md rule 8).
 */
export class Sim {
  private readonly _seed: number;
  private _state: SimState;

  constructor(seed: number, startY: number = 0) {
    this._seed = seed;
    const edges = computeRoadEdges();
    const startX = (edges.footpathPlayerRightX + edges.dividerLeftX) / 2;

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
      },
    };
  }

  get seed(): number {
    return this._seed;
  }

  get state(): Readonly<SimState> {
    return this._state;
  }

  step(dt: number, input: Input): SimEvent[] {
    const movedPlayer = stepVehicle(this._state.player, input, VEHICLES.car, dt);
    const { state: player, events } = resolveRoadContact(movedPlayer, VEHICLES.car, dt);

    this._state = {
      stepCount: this._state.stepCount + 1,
      elapsedSeconds: this._state.elapsedSeconds + dt,
      player,
    };

    return events;
  }
}

import { describe, expect, it } from 'vitest';
import { resolveRoadContact } from '../../src/sim/collision';
import { computeRoadEdges } from '../../src/sim/road';
import { VEHICLES, COLLISION, SIM } from '../../src/sim/config';
import type { PlayerVehicleState } from '../../src/sim/types';

const car = VEHICLES.car;
const dt = SIM.stepSeconds;
const edges = computeRoadEdges();

function stateAt(x: number, overrides: Partial<PlayerVehicleState> = {}): PlayerVehicleState {
  return { x, y: 0, heading: 0, speed: car.maxSpeed * 0.5, health: car.health, kerbCooldown: 0, ...overrides };
}

describe('resolveRoadContact', () => {
  it('pushes the car back onto the road and halves speed on kerb contact', () => {
    const intrudingX = edges.footpathPlayerRightX + car.width / 2 - 5; // 5px over the kerb line
    const state = stateAt(intrudingX);
    const preSpeed = state.speed;

    const { state: next, events } = resolveRoadContact(state, car, dt);

    expect(next.x - car.width / 2).toBeCloseTo(edges.footpathPlayerRightX, 5);
    expect(next.speed).toBeCloseTo(preSpeed * COLLISION.kerbSpeedMultiplier, 5);
    expect(events).toContainEqual({ type: 'kerbContact', healthLost: COLLISION.kerbHealthLoss });
    expect(next.health).toBe(car.health - COLLISION.kerbHealthLoss);
  });

  it('pushes the car back onto the road and halves speed on divider contact', () => {
    const intrudingX = edges.dividerLeftX - car.width / 2 + 5; // 5px over the divider line
    const state = stateAt(intrudingX);
    const preSpeed = state.speed;

    const { state: next, events } = resolveRoadContact(state, car, dt);

    expect(next.x + car.width / 2).toBeCloseTo(edges.dividerLeftX, 5);
    expect(next.speed).toBeCloseTo(preSpeed * COLLISION.kerbSpeedMultiplier, 5);
    expect(events).toContainEqual({ type: 'dividerContact', healthLost: COLLISION.kerbHealthLoss });
  });

  it('does not deduct health when speed is below the 30% threshold', () => {
    const intrudingX = edges.footpathPlayerRightX + car.width / 2 - 5;
    const state = stateAt(intrudingX, { speed: car.maxSpeed * COLLISION.kerbHealthSpeedThreshold * 0.5 });

    const { state: next, events } = resolveRoadContact(state, car, dt);

    expect(next.health).toBe(car.health);
    expect(events).toContainEqual({ type: 'kerbContact', healthLost: 0 });
  });

  it('does not deduct health again inside the cooldown window', () => {
    const intrudingX = edges.footpathPlayerRightX + car.width / 2 - 5;
    const first = resolveRoadContact(stateAt(intrudingX), car, dt);
    expect(first.state.health).toBe(car.health - COLLISION.kerbHealthLoss);

    // Simulate the car still being steered into the kerb on the next step
    // (push-back alone resolves the overlap, so re-use the original
    // intruding x here, carrying over the health/cooldown from the first hit).
    const stillIntruding = {
      ...stateAt(intrudingX),
      health: first.state.health,
      kerbCooldown: first.state.kerbCooldown,
    };
    const second = resolveRoadContact(stillIntruding, car, dt);
    expect(second.state.health).toBe(first.state.health);
    expect(second.events).toContainEqual({ type: 'kerbContact', healthLost: 0 });
  });

  it('leaves the car untouched when it is fully on the carriageway', () => {
    const state = stateAt((edges.footpathPlayerRightX + edges.dividerLeftX) / 2);
    const { state: next, events } = resolveRoadContact(state, car, dt);
    expect(next.x).toBe(state.x);
    expect(next.speed).toBe(state.speed);
    expect(events).toHaveLength(0);
  });
});

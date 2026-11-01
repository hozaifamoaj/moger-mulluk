import { describe, expect, it } from 'vitest';
import { resolveRoadContact, resolveVehicleCollisions } from '../../src/sim/collision';
import { computeRoadEdges } from '../../src/sim/road';
import { VEHICLES, COLLISION, SIM, VEHICLE_COLLISION } from '../../src/sim/config';
import type { PlayerVehicleState, TrafficVehicleState } from '../../src/sim/types';

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

function trafficAt(x: number, overrides: Partial<TrafficVehicleState> = {}): TrafficVehicleState {
  return {
    active: true,
    type: 'car',
    x,
    y: 0,
    speed: 0,
    cruiseSpeed: 0,
    width: 36,
    length: 72,
    stopTimer: 0,
    sidewaysShift: null,
    nearMissGiven: false,
    ...overrides,
  };
}

describe('resolveVehicleCollisions', () => {
  it('leaves the player untouched and decays invulnerability when nothing is nearby', () => {
    const player = stateAt(0, { speed: 100 });
    const vehicle = trafficAt(10_000); // far outside the scan margin

    const { state: next, invulnerability, events } = resolveVehicleCollisions(player, [vehicle], 0.2, car, dt);

    expect(next.x).toBe(player.x);
    expect(next.y).toBe(player.y);
    expect(invulnerability).toBeCloseTo(0.2 - dt, 10);
    expect(events).toHaveLength(0);
  });

  it('classifies a low relative-speed hit as a scrape: light damage, 70% speed kept', () => {
    const player = stateAt(0, { speed: 0 });
    const vehicle = trafficAt(20, { speed: 50 }); // overlapping; relative speed 50 < scrapeSpeedThreshold

    const { state: next, invulnerability, events } = resolveVehicleCollisions(player, [vehicle], 0, car, dt);

    expect(next.health).toBe(car.health - VEHICLE_COLLISION.scrapeHealthLoss);
    expect(next.speed).toBeCloseTo(0 * VEHICLE_COLLISION.scrapeSpeedMultiplier, 10);
    expect(vehicle.stopTimer).toBe(VEHICLE_COLLISION.hitVehiclePauseSeconds);
    expect(invulnerability).toBe(VEHICLE_COLLISION.invulnerabilitySeconds);
    expect(events).toContainEqual({
      type: 'vehicleCollision',
      healthLost: VEHICLE_COLLISION.scrapeHealthLoss,
      collisionClass: 'scrape',
      trafficId: 0,
    });
  });

  it('classifies a high relative-speed hit as highSpeed: heavy damage, 30% speed kept', () => {
    const player = stateAt(0, { speed: 0 });
    const vehicle = trafficAt(20, { speed: 300 }); // relative speed 300 > highSpeedThreshold

    const { state: next, events } = resolveVehicleCollisions(player, [vehicle], 0, car, dt);

    expect(next.health).toBe(car.health - VEHICLE_COLLISION.highSpeedHealthLoss);
    expect(events).toContainEqual({
      type: 'vehicleCollision',
      healthLost: VEHICLE_COLLISION.highSpeedHealthLoss,
      collisionClass: 'highSpeed',
      trafficId: 0,
    });
  });

  it('pushes the player apart with no further damage while still invulnerable', () => {
    const player = stateAt(0, { speed: 200, health: car.health });
    const vehicle = trafficAt(20, { speed: 300 });

    const { state: next, invulnerability, events } = resolveVehicleCollisions(player, [vehicle], 0.5, car, dt);

    expect(next.health).toBe(car.health);
    expect(next.speed).toBe(player.speed);
    expect(next.x).not.toBe(player.x); // still pushed apart by the mtv
    expect(invulnerability).toBeCloseTo(0.5 - dt, 10);
    expect(events).toContainEqual({ type: 'vehicleCollision', healthLost: 0, trafficId: 0 });
    expect(vehicle.stopTimer).toBe(0); // not re-paused by a no-damage push-apart
  });
});

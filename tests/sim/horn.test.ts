import { describe, expect, it } from 'vitest';
import { stepHorn } from '../../src/sim/horn';
import { createDefaultTestMap } from '../../src/sim/map';
import { HORN, SIM } from '../../src/sim/config';
import { computeRoadEdges } from '../../src/sim/road';
import type { Input, PedestrianState, TrafficVehicleState } from '../../src/sim/types';

const dt = SIM.stepSeconds;
const map = createDefaultTestMap();
const edges = computeRoadEdges(map.laneCountAt(1000));
const player = { x: (edges.footpathPlayerRightX + edges.dividerLeftX) / 2, y: 1000 };

function pressHorn(): Input {
  return { throttle: 0, brake: 0, steer: 0, horn: true };
}
function noInput(): Input {
  return { throttle: 0, brake: 0, steer: 0, horn: false };
}

function freshRickshaw(overrides: Partial<TrafficVehicleState> = {}): TrafficVehicleState {
  return {
    active: true,
    type: 'rickshaw',
    x: player.x,
    y: player.y - HORN.aheadDistance / 2, // inside the zone
    speed: 0,
    cruiseSpeed: 0,
    width: 28,
    length: 50,
    stopTimer: 0,
    sidewaysShift: null,
    drift: null,
    direction: 1,
    lastBusStopY: null,
    nearMissGiven: false,
    ...overrides,
  };
}

function freshPedestrian(overrides: Partial<PedestrianState> = {}): PedestrianState {
  return {
    active: true,
    crossingIndex: 0,
    isWaitingPassenger: false,
    usesOverbridge: false,
    phase: 'waiting',
    x: player.x,
    y: player.y - HORN.aheadDistance / 2, // inside the zone
    startX: 0,
    targetX: 100,
    speed: 60,
    waitTimer: 1,
    midwayStopX: null,
    hasStoppedMidway: false,
    stopTimer: 0,
    speedBoostTimer: 0,
    ...overrides,
  };
}

describe('stepHorn', () => {
  it('ticks the cooldown down regardless of input', () => {
    const { hornCooldown } = stepHorn(noInput(), 1, player, [], [], map, dt);
    expect(hornCooldown).toBeCloseTo(1 - dt, 10);
  });

  it('never drops the cooldown below zero', () => {
    const { hornCooldown } = stepHorn(noInput(), 0, player, [], [], map, dt);
    expect(hornCooldown).toBe(0);
  });

  it('does nothing when horn input is not pressed', () => {
    const { hornCooldown, events } = stepHorn(noInput(), 0, player, [], [], map, dt);
    expect(hornCooldown).toBe(0);
    expect(events).toHaveLength(0);
  });

  it('does nothing on a fresh press while still on cooldown', () => {
    const { hornCooldown, events } = stepHorn(pressHorn(), 1, player, [], [], map, dt);
    expect(hornCooldown).toBeCloseTo(1 - dt, 10);
    expect(events).toHaveLength(0);
  });

  it('triggers on a fresh press once the cooldown has elapsed: resets cooldown, emits hornUsed', () => {
    const { hornCooldown, events } = stepHorn(pressHorn(), 0, player, [], [], map, dt);
    expect(hornCooldown).toBe(HORN.cooldownSeconds);
    expect(events).toContainEqual({ type: 'hornUsed', healthLost: 0 });
  });

  it('shifts an in-zone rickshaw without an existing shift toward the nearer kerb', () => {
    const roadCenterX = (edges.footpathPlayerRightX + edges.dividerLeftX) / 2;
    const rickshaw = freshRickshaw({ x: roadCenterX - 10 }); // left of center: nearer the player-side kerb
    stepHorn(pressHorn(), 0, player, [rickshaw], [], map, dt);

    expect(rickshaw.sidewaysShift).not.toBeNull();
    expect(rickshaw.sidewaysShift!.side).toBe(-1);
    expect(rickshaw.sidewaysShift!.magnitude).toBe(HORN.rickshawShiftMagnitude);
    expect(rickshaw.sidewaysShift!.speed).toBeCloseTo(
      HORN.rickshawShiftMagnitude / HORN.rickshawShiftDurationSeconds,
      10,
    );
  });

  it('shifts toward the opposite kerb when the rickshaw sits right of road center', () => {
    const roadCenterX = (edges.footpathPlayerRightX + edges.dividerLeftX) / 2;
    const rickshaw = freshRickshaw({ x: roadCenterX + 10 });
    stepHorn(pressHorn(), 0, player, [rickshaw], [], map, dt);

    expect(rickshaw.sidewaysShift!.side).toBe(1);
  });

  it('does not touch a rickshaw that already has a sideways shift in progress', () => {
    const existing = { remainingTriggerDistance: 0, magnitude: 99, side: 1 as const, progress: 5, speed: 10 };
    const rickshaw = freshRickshaw({ sidewaysShift: existing });
    stepHorn(pressHorn(), 0, player, [rickshaw], [], map, dt);

    expect(rickshaw.sidewaysShift).toBe(existing);
  });

  it('does not affect an inactive rickshaw', () => {
    const rickshaw = freshRickshaw({ active: false });
    stepHorn(pressHorn(), 0, player, [rickshaw], [], map, dt);
    expect(rickshaw.sidewaysShift).toBeNull();
  });

  it('does not affect a rickshaw outside the horn zone', () => {
    const rickshaw = freshRickshaw({ y: player.y - HORN.aheadDistance - 50 });
    stepHorn(pressHorn(), 0, player, [rickshaw], [], map, dt);
    expect(rickshaw.sidewaysShift).toBeNull();
  });

  it('does not affect a non-rickshaw vehicle type', () => {
    const car = freshRickshaw({ type: 'car' });
    stepHorn(pressHorn(), 0, player, [car], [], map, dt);
    expect(car.sidewaysShift).toBeNull();
  });

  it('extends a waiting pedestrian\'s wait timer by the configured extension', () => {
    const ped = freshPedestrian({ phase: 'waiting', waitTimer: 1 });
    stepHorn(pressHorn(), 0, player, [], [ped], map, dt);
    expect(ped.waitTimer).toBeCloseTo(1 + HORN.pedestrianWaitExtensionSeconds, 10);
  });

  it('gives a walking pedestrian a temporary speed boost instead of extending a wait', () => {
    const ped = freshPedestrian({ phase: 'walking', waitTimer: 0, speedBoostTimer: 0 });
    stepHorn(pressHorn(), 0, player, [], [ped], map, dt);
    expect(ped.speedBoostTimer).toBe(HORN.pedestrianSpeedBoostSeconds);
    expect(ped.waitTimer).toBe(0);
  });

  it('ignores a waiting-passenger pedestrian even if inside the zone', () => {
    const ped = freshPedestrian({ isWaitingPassenger: true, phase: 'waiting', waitTimer: 5 });
    stepHorn(pressHorn(), 0, player, [], [ped], map, dt);
    expect(ped.waitTimer).toBe(5);
  });

  it('ignores an overbridge pedestrian even if inside the zone', () => {
    const ped = freshPedestrian({ usesOverbridge: true, phase: 'waiting', waitTimer: 5 });
    stepHorn(pressHorn(), 0, player, [], [ped], map, dt);
    expect(ped.waitTimer).toBe(5);
  });

  it('ignores a pedestrian outside the horn zone', () => {
    const ped = freshPedestrian({ phase: 'waiting', waitTimer: 1, y: player.y - HORN.aheadDistance - 50 });
    stepHorn(pressHorn(), 0, player, [], [ped], map, dt);
    expect(ped.waitTimer).toBe(1);
  });

  it('ignores an inactive pedestrian', () => {
    const ped = freshPedestrian({ active: false, phase: 'waiting', waitTimer: 1 });
    stepHorn(pressHorn(), 0, player, [], [ped], map, dt);
    expect(ped.waitTimer).toBe(1);
  });
});

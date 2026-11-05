import { describe, expect, it } from 'vitest';
import { checkFail, checkFinish } from '../../src/sim/run';
import { RUN } from '../../src/sim/config';
import type { PlayerVehicleState } from '../../src/sim/types';

function makePlayer(overrides: Partial<PlayerVehicleState> = {}): PlayerVehicleState {
  return {
    x: 0,
    y: 0,
    heading: 0,
    speed: 0,
    health: 100,
    kerbCooldown: 0,
    fineActive: false,
    ...overrides,
  };
}

describe('checkFinish', () => {
  it('is true inside the finish zone below the max speed', () => {
    expect(checkFinish(makePlayer({ y: RUN.finish.length - 1, speed: RUN.finish.maxSpeed - 1 }))).toBe(true);
  });

  it('is false above the max speed, even inside the zone', () => {
    expect(checkFinish(makePlayer({ y: 0, speed: RUN.finish.maxSpeed }))).toBe(false);
  });

  it('is false outside the finish zone', () => {
    expect(checkFinish(makePlayer({ y: RUN.finish.length + 1, speed: 0 }))).toBe(false);
  });

  it('is false past the end of the route (y < 0)', () => {
    expect(checkFinish(makePlayer({ y: -1, speed: 0 }))).toBe(false);
  });

  it('uses absolute speed, so reversing slowly inside the zone still counts', () => {
    expect(checkFinish(makePlayer({ y: 0, speed: -(RUN.finish.maxSpeed - 1) }))).toBe(true);
  });
});

describe('checkFail', () => {
  it('returns null while none of the conditions hold', () => {
    expect(checkFail(makePlayer(), 0, false)).toBeNull();
  });

  it('fails on pedestrian hit, ahead of the other conditions', () => {
    expect(checkFail(makePlayer({ health: 0 }), RUN.timeLimitSeconds, true)).toBe('pedestrian');
  });

  it('fails as wrecked once health reaches 0', () => {
    expect(checkFail(makePlayer({ health: 0 }), 0, false)).toBe('wrecked');
  });

  it('fails as wrecked ahead of time, when both hold', () => {
    expect(checkFail(makePlayer({ health: 0 }), RUN.timeLimitSeconds, false)).toBe('wrecked');
  });

  it('fails on time once the limit is reached', () => {
    expect(checkFail(makePlayer(), RUN.timeLimitSeconds, false)).toBe('time');
  });

  it('does not fail on time just under the limit', () => {
    expect(checkFail(makePlayer(), RUN.timeLimitSeconds - 0.001, false)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/sim';
import { RUN, SIM } from '../../src/sim/config';
import { createDefaultTestMap } from '../../src/sim/map';
import type { Input } from '../../src/sim/types';

const map = createDefaultTestMap();

function rectsOverlap(
  a: { x: number; y: number; width: number; length: number },
  b: { x: number; y: number; width: number; length: number },
): boolean {
  return Math.abs(a.x - b.x) < a.width / 2 + b.width / 2 && Math.abs(a.y - b.y) < a.length / 2 + b.length / 2;
}

// A fixed, varied input sequence (not randomness — determinism must hold
// given any identical sequence of inputs, seeded or not).
function inputAt(step: number): Input {
  const phase = step % 120;
  return {
    throttle: phase < 80 ? 1 : 0,
    brake: phase >= 80 && phase < 100 ? 1 : 0,
    steer: phase < 40 ? 1 : phase < 60 ? -1 : 0,
    horn: phase === 0,
  };
}

describe('Sim', () => {
  it('produces an identical final state for the same seed and input sequence', () => {
    const a = new Sim(42, map, 10000);
    const b = new Sim(42, map, 10000);

    for (let i = 0; i < 500; i++) {
      a.step(SIM.stepSeconds, inputAt(i));
      b.step(SIM.stepSeconds, inputAt(i));
    }

    expect(a.state).toEqual(b.state);
  });

  it('starts the player centered in the player carriageway, at the given startY', () => {
    const sim = new Sim(1, map, 5000);
    expect(sim.state.player.y).toBe(5000);
    expect(sim.state.stepCount).toBe(0);
  });

  it('advances stepCount and elapsedSeconds on each step', () => {
    const sim = new Sim(1, map, 0);
    sim.step(SIM.stepSeconds, { throttle: 0, brake: 0, steer: 0, horn: false });
    expect(sim.state.stepCount).toBe(1);
    expect(sim.state.elapsedSeconds).toBeCloseTo(SIM.stepSeconds, 10);
  });

  it('fills the traffic pool to the target density on construction', () => {
    const sim = new Sim(1, map, 10000);
    const active = sim.state.traffic.filter((v) => v.active);
    expect(active.length).toBe(map.targetActiveCountAt(10000));
  });

  it('never lets two active traffic vehicles overlap, across many steps and spawns', () => {
    const sim = new Sim(123, map, 50000);
    const input: Input = { throttle: 1, brake: 0, steer: 0, horn: false };

    for (let i = 0; i < 2000; i++) {
      sim.step(SIM.stepSeconds, input);
      const active = sim.state.traffic.filter((v) => v.active);
      for (let a = 0; a < active.length; a++) {
        for (let b = a + 1; b < active.length; b++) {
          expect(rectsOverlap(active[a], active[b])).toBe(false);
        }
      }
    }
  });

  it('keeps the traffic pool topped up as vehicles despawn behind the player', () => {
    const sim = new Sim(55, map, 50000);
    const input: Input = { throttle: 1, brake: 0, steer: 0, horn: false };

    for (let i = 0; i < 3000; i++) {
      sim.step(SIM.stepSeconds, input);
    }

    const active = sim.state.traffic.filter((v) => v.active);
    expect(active.length).toBe(map.targetActiveCountAt(sim.state.player.y));
  });

  it('fails on time, freezes state and stops emitting events once failed', () => {
    // Stays well outside the finish zone (never moves, with zero throttle) so
    // the timer runs out before checkFinish could ever fire instead.
    const sim = new Sim(1, map, map.totalLength);
    const input: Input = { throttle: 0, brake: 0, steer: 0, horn: false };
    const totalSteps = Math.ceil(RUN.timeLimitSeconds / SIM.stepSeconds);

    let sawFail = false;
    for (let i = 0; i < totalSteps; i++) {
      const events = sim.step(SIM.stepSeconds, input);
      if (events.some((e) => e.type === 'fail')) sawFail = true;
    }

    expect(sawFail).toBe(true);
    expect(sim.state.runStatus).toBe('failed');
    expect(sim.state.failReason).toBe('time');

    const frozen = sim.state;
    const events = sim.step(SIM.stepSeconds, input);
    expect(events).toEqual([]);
    expect(sim.state).toBe(frozen);
  });

  it('gives the same score for the same seed and input sequence', () => {
    const a = new Sim(7, map, 10000);
    const b = new Sim(7, map, 10000);
    const input: Input = { throttle: 1, brake: 0, steer: 0, horn: false };

    for (let i = 0; i < 500; i++) {
      a.step(SIM.stepSeconds, input);
      b.step(SIM.stepSeconds, input);
    }

    expect(a.state.score).toBe(b.state.score);
  });
});

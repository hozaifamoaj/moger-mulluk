import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/sim';
import { SIM } from '../../src/sim/config';
import type { Input } from '../../src/sim/types';

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
    const a = new Sim(42, 10000);
    const b = new Sim(42, 10000);

    for (let i = 0; i < 500; i++) {
      a.step(SIM.stepSeconds, inputAt(i));
      b.step(SIM.stepSeconds, inputAt(i));
    }

    expect(a.state).toEqual(b.state);
  });

  it('starts the player centered in the player carriageway, at the given startY', () => {
    const sim = new Sim(1, 5000);
    expect(sim.state.player.y).toBe(5000);
    expect(sim.state.stepCount).toBe(0);
  });

  it('advances stepCount and elapsedSeconds on each step', () => {
    const sim = new Sim(1, 0);
    sim.step(SIM.stepSeconds, { throttle: 0, brake: 0, steer: 0, horn: false });
    expect(sim.state.stepCount).toBe(1);
    expect(sim.state.elapsedSeconds).toBeCloseTo(SIM.stepSeconds, 10);
  });
});

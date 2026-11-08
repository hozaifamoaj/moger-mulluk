import { describe, expect, it } from 'vitest';
import { buildScorePayload, type ScoreSubmissionInput } from '../../src/online/scorePayload';

function winInput(overrides: Partial<ScoreSubmissionInput> = {}): ScoreSubmissionInput {
  return {
    outcome: 'win',
    failReason: null,
    score: 1234.6,
    durationSeconds: 92.345,
    seed: 7,
    vehicleId: 'car',
    ...overrides,
  };
}

describe('buildScorePayload', () => {
  it('builds a submission for a win', () => {
    expect(buildScorePayload(winInput(), 'Rafi', '0.1.0')).toEqual({
      nickname: 'Rafi',
      vehicle: 'car',
      score: 1235,
      duration_ms: 92345,
      seed: 7,
      game_version: '0.1.0',
    });
  });

  it('never builds a submission for a failed run', () => {
    expect(buildScorePayload(winInput({ outcome: 'fail', failReason: 'time' }), 'Rafi', '0.1.0')).toBeNull();
  });
});

import type { FailReason, PlayableVehicleId } from '../sim/types';
import type { ScoreSubmission } from './leaderboard';

// Mirrors the fields of ResultsScene's ResultsData that matter for a
// leaderboard submission, kept separate from the scene so this stays a pure,
// unit-testable function (rule: "Failed runs are never submitted").
export interface ScoreSubmissionInput {
  outcome: 'win' | 'fail';
  failReason: FailReason | null;
  score: number;
  durationSeconds: number;
  seed: number;
  vehicleId: PlayableVehicleId;
}

export function buildScorePayload(data: ScoreSubmissionInput, nickname: string, gameVersion: string): ScoreSubmission | null {
  if (data.outcome !== 'win') return null;

  return {
    nickname,
    vehicle: data.vehicleId,
    score: Math.round(data.score),
    duration_ms: Math.round(data.durationSeconds * 1000),
    seed: data.seed,
    game_version: gameVersion,
  };
}

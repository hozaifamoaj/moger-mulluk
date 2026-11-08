import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlayableVehicleId } from '../sim/types';
import { withTimeout } from './withTimeout';

export interface ScoreSubmission {
  nickname: string;
  vehicle: PlayableVehicleId;
  score: number;
  duration_ms: number;
  seed: number;
  game_version: string;
}

export type SubmitResult = { ok: true } | { ok: false; reason: 'rate_limited' | 'network' };

export interface LeaderboardRow {
  nickname: string;
  score: number;
  created_at: string;
}

// §12.7 client call #2: reuses a remembered session if one exists; only
// needs `captchaToken` the first time a device signs in (or after the
// session is lost, e.g. localStorage cleared — §13.1).
export async function signInIfNeeded(client: SupabaseClient, captchaToken?: string): Promise<boolean> {
  try {
    const { data } = await withTimeout(client.auth.getSession());
    if (data.session) return true;

    const { error } = await withTimeout(
      client.auth.signInAnonymously(captchaToken ? { options: { captchaToken } } : undefined),
    );
    return !error;
  } catch {
    return false;
  }
}

// §12.7 client call #3. A `rate_limited` error (the trigger's exact message,
// per the migration) is distinguished so the caller can skip queuing it —
// per the spec, "A rate_limited error is not retried."
export async function submitScore(client: SupabaseClient, submission: ScoreSubmission): Promise<SubmitResult> {
  try {
    const { error } = await withTimeout(client.from('scores').insert(submission));
    if (!error) return { ok: true };
    return { ok: false, reason: error.message.includes('rate_limited') ? 'rate_limited' : 'network' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

// §12.7 client call #4 / §10.2: top 50 best scores for one vehicle.
export async function queryTop50(client: SupabaseClient, vehicle: PlayableVehicleId): Promise<LeaderboardRow[] | null> {
  try {
    const { data, error } = await withTimeout(
      client.from('leaderboard').select('nickname, score, created_at').eq('vehicle', vehicle).order('score', { ascending: false }).limit(50),
    );
    if (error || !data) return null;
    return data as LeaderboardRow[];
  } catch {
    return null;
  }
}

// §10.2 "the player's own best rank": not given as example code in §12.7,
// so computed as 1 + the count of better scores for the same vehicle,
// against the same `leaderboard` view (one row per player per vehicle, so
// this doesn't need to know the player's identity at all — only their score).
export async function queryRank(client: SupabaseClient, vehicle: PlayableVehicleId, score: number): Promise<number | null> {
  try {
    const { count, error } = await withTimeout(
      client.from('leaderboard').select('*', { count: 'exact', head: true }).eq('vehicle', vehicle).gt('score', score),
    );
    if (error || count === null) return null;
    return count + 1;
  } catch {
    return null;
  }
}

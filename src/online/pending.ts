import type { SupabaseClient } from '@supabase/supabase-js';
import * as storage from '../storage';
import { signInIfNeeded, submitScore, type ScoreSubmission } from './leaderboard';

// §12.6 mm.pending: scores that failed to submit, resent on the next launch.
const PENDING_KEY = 'pending';

function readPending(): ScoreSubmission[] {
  const stored = storage.get<unknown>(PENDING_KEY, []);
  return Array.isArray(stored) ? (stored as ScoreSubmission[]) : [];
}

export function enqueuePending(submission: ScoreSubmission): void {
  storage.set<ScoreSubmission[]>(PENDING_KEY, [...readPending(), submission]);
}

// §12.7 failure handling: called once at boot. A `rate_limited` result is
// dropped rather than requeued ("not retried"); a network/other failure
// stays queued for the next launch.
export async function flushPending(client: SupabaseClient): Promise<void> {
  const pending = readPending();
  if (pending.length === 0) return;

  const signedIn = await signInIfNeeded(client);
  if (!signedIn) return; // try again next launch; queue is left untouched

  const remaining: ScoreSubmission[] = [];
  for (const submission of pending) {
    const result = await submitScore(client, submission);
    if (!result.ok && result.reason !== 'rate_limited') remaining.push(submission);
  }
  storage.set<ScoreSubmission[]>(PENDING_KEY, remaining);
}

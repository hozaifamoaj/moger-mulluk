import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it } from 'vitest';
import * as storage from '../../src/storage';
import { enqueuePending, flushPending } from '../../src/online/pending';
import type { ScoreSubmission } from '../../src/online/leaderboard';

function fakeStorage(overrides: Partial<Storage> = {}): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
    get length() {
      return data.size;
    },
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    ...overrides,
  } as Storage;
}

function submission(overrides: Partial<ScoreSubmission> = {}): ScoreSubmission {
  return { nickname: 'Rafi', vehicle: 'car', score: 100, duration_ms: 90000, seed: 1, game_version: '0.1.0', ...overrides };
}

// `insertResults` is consumed in call order, one result per `insert()` call,
// so each test can script exactly what each queued submission's retry does.
function fakeClient(insertResults: Array<{ error: { message: string } | null }>): SupabaseClient {
  let callIndex = 0;
  return {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      signInAnonymously: async () => ({ error: null }),
    },
    from: () => ({
      insert: async () => insertResults[callIndex++] ?? { error: null },
    }),
  } as unknown as SupabaseClient;
}

describe('pending queue', () => {
  afterEach(() => {
    globalThis.localStorage = fakeStorage();
  });

  it('keeps a failed submission queued, then sends it on the next flush', async () => {
    globalThis.localStorage = fakeStorage();
    enqueuePending(submission());
    expect(storage.get<ScoreSubmission[]>('pending', [])).toHaveLength(1);

    await flushPending(fakeClient([{ error: null }]));

    expect(storage.get<ScoreSubmission[]>('pending', [])).toEqual([]);
  });

  it('does not retry a rate_limited submission, but keeps retrying a network failure', async () => {
    globalThis.localStorage = fakeStorage();
    enqueuePending(submission({ nickname: 'RateLimited' }));
    enqueuePending(submission({ nickname: 'NetworkFail' }));

    await flushPending(
      fakeClient([{ error: { message: 'rate_limited: too many submissions' } }, { error: { message: 'network down' } }]),
    );

    const remaining = storage.get<ScoreSubmission[]>('pending', []);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].nickname).toBe('NetworkFail');
  });

  it('leaves the queue untouched when sign-in itself fails', async () => {
    globalThis.localStorage = fakeStorage();
    enqueuePending(submission());

    const client = {
      auth: {
        getSession: async () => ({ data: { session: null } }),
        signInAnonymously: async () => ({ error: { message: 'network down' } }),
      },
      from: () => ({ insert: async () => ({ error: null }) }),
    } as unknown as SupabaseClient;

    await flushPending(client);

    expect(storage.get<ScoreSubmission[]>('pending', [])).toHaveLength(1);
  });
});

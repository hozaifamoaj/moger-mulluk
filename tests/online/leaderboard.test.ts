import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { queryRank, queryTop50, signInIfNeeded, submitScore } from '../../src/online/leaderboard';

describe('submitScore', () => {
  it('classifies the rate-limit trigger error as rate_limited, not network', async () => {
    const client = {
      from: () => ({ insert: async () => ({ error: { message: 'rate_limited: slow down' } }) }),
    } as unknown as SupabaseClient;

    const result = await submitScore(client, { nickname: 'Rafi', vehicle: 'car', score: 1, duration_ms: 1, seed: 1, game_version: '0.1.0' });
    expect(result).toEqual({ ok: false, reason: 'rate_limited' });
  });

  it('classifies any other error as network', async () => {
    const client = {
      from: () => ({ insert: async () => ({ error: { message: 'connection reset' } }) }),
    } as unknown as SupabaseClient;

    const result = await submitScore(client, { nickname: 'Rafi', vehicle: 'car', score: 1, duration_ms: 1, seed: 1, game_version: '0.1.0' });
    expect(result).toEqual({ ok: false, reason: 'network' });
  });

  it('returns ok when the insert succeeds', async () => {
    const client = { from: () => ({ insert: async () => ({ error: null }) }) } as unknown as SupabaseClient;
    const result = await submitScore(client, { nickname: 'Rafi', vehicle: 'car', score: 1, duration_ms: 1, seed: 1, game_version: '0.1.0' });
    expect(result).toEqual({ ok: true });
  });
});

describe('signInIfNeeded', () => {
  it('reuses an existing session without calling signInAnonymously', async () => {
    let signInCalled = false;
    const client = {
      auth: {
        getSession: async () => ({ data: { session: { access_token: 'existing' } } }),
        signInAnonymously: async () => {
          signInCalled = true;
          return { error: null };
        },
      },
    } as unknown as SupabaseClient;

    expect(await signInIfNeeded(client)).toBe(true);
    expect(signInCalled).toBe(false);
  });

  it('signs in anonymously when there is no session', async () => {
    const client = {
      auth: {
        getSession: async () => ({ data: { session: null } }),
        signInAnonymously: async () => ({ error: null }),
      },
    } as unknown as SupabaseClient;

    expect(await signInIfNeeded(client)).toBe(true);
  });
});

describe('queryTop50 / queryRank', () => {
  it('returns null on a query error instead of throwing', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({ limit: async () => ({ data: null, error: { message: 'down' } }) }),
            gt: async () => ({ count: null, error: { message: 'down' } }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    expect(await queryTop50(client, 'car')).toBeNull();
    expect(await queryRank(client, 'car', 100)).toBeNull();
  });

  it('turns a count of better scores into a 1-based rank', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            gt: async () => ({ count: 4, error: null }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    expect(await queryRank(client, 'car', 100)).toBe(5);
  });
});

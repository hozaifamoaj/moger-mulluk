import { afterEach, describe, expect, it, vi } from 'vitest';
import { getClient, resetClientForTests } from '../../src/online/client';

describe('getClient', () => {
  afterEach(() => {
    resetClientForTests();
    vi.unstubAllEnvs();
  });

  it('returns null when both env vars are missing', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    expect(getClient()).toBeNull();
  });

  it('returns null when only one env var is set', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    expect(getClient()).toBeNull();
  });

  it('builds and memoizes a client when both env vars are set', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'anon-key');
    const first = getClient();
    expect(first).not.toBeNull();
    expect(getClient()).toBe(first);
  });
});

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// §12.7 / CLAUDE.md rule 12: online features are entirely disabled when
// either env var is missing at build time — this is the single place that
// decides that, so every other module (and every scene) just asks "do I
// have a client" instead of re-checking env vars itself.
let client: SupabaseClient | null | undefined;

export function getClient(): SupabaseClient | null {
  if (client !== undefined) return client;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  client = url && key ? createClient(url, key) : null;
  return client;
}

// Test-only: clears the memoized client so each test starts from a clean slate.
export function resetClientForTests(): void {
  client = undefined;
}

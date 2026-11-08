/// <reference types="vite/client" />

// §12.7: the only two env vars src/online/ is allowed to read (CLAUDE.md
// rule 12).
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
}

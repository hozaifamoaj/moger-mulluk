// §12.7 Setup: "turn on its CAPTCHA option" for anonymous sign-in. The
// Turnstile site key is public by design (meant to sit in client-side HTML,
// unlike the Supabase keys), so it's a literal constant rather than a third
// env var — CLAUDE.md rule 12 reads only VITE_SUPABASE_URL and
// VITE_SUPABASE_PUBLISHABLE_KEY. The value below is Cloudflare's own
// publicly documented "always passes" test site key; replace it with your
// project's real Turnstile site key before relying on anonymous sign-in
// against a project that actually has CAPTCHA enabled.
export const TURNSTILE_SITE_KEY = '1x00000000000000000000AA';

interface TurnstileApi {
  render(container: HTMLElement, options: { sitekey: string; callback: (token: string) => void }): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// Renders the widget into `container` and calls `onToken` once the
// challenge passes. Returns a cleanup function. If the script failed to
// load (blocked network, ad blocker, offline dev), `window.turnstile` is
// undefined — signInIfNeeded is then called without a token and simply
// fails on a project that truly requires one, which is reported as
// "leaderboard unavailable" like any other sign-in failure.
export function renderTurnstile(container: HTMLElement, onToken: (token: string) => void): () => void {
  if (!window.turnstile) return () => {};

  const widgetId = window.turnstile.render(container, { sitekey: TURNSTILE_SITE_KEY, callback: onToken });
  return () => window.turnstile?.remove(widgetId);
}

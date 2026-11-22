# Moger-mulluk

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://moger-mulluk.hozaifamoaj.workers.dev)

Top-down 2D browser game: drive through Dhaka traffic from Mohakhali to Banani before the timer runs out.

The design spec and milestone plan are kept out of version control (see `.gitignore`) and developed locally.

## Requirements

- Node.js 20 or later (developed and tested on Node 22).

## Commands

```
npm install
npm run dev        # local dev server
npm run build      # production build to dist/
npm run preview    # serve dist/
npm test           # Vitest
npm run typecheck  # tsc --noEmit
npm run lint       # ESLint
npm run check      # typecheck + lint + test + build
```

## Deploying to Cloudflare Pages

1. Connect this Git repository to a new Cloudflare Pages project.
2. Build command: `npm run build`
3. Build output directory: `dist`
4. From milestone M8 onward, set the environment variables below in the Pages project settings (Production and Preview).

## Setting up the Supabase project (milestone M8, online leaderboard)

The leaderboard is entirely optional — skip this section and the game runs fully offline with no leaderboard UI shown at all.

1. Create a Supabase project.
2. Run `supabase/migrations/001_scores.sql` in the project's SQL editor. There is no migration runner in this repo (CLAUDE.md rule 12: no backend code, no server); apply it by hand, once.
3. In Authentication settings, enable **anonymous sign-ins**.
4. Optional but recommended: turn on **CAPTCHA protection** for anonymous sign-ins (Authentication → Settings) and create a Cloudflare Turnstile site. The game ships with Cloudflare's public always-passing test site key hardcoded in `src/online/turnstile.ts` — replace `TURNSTILE_SITE_KEY` with your project's real site key before relying on this in production.
5. Copy the project URL and the `anon`/publishable key into the environment variables below.

## Environment variables

Copy `.env.example` to `.env.local` for local development. Both variables are only needed from milestone M8 (the online leaderboard); without them the game builds and runs fully offline.

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anonymous/publishable key |

Never put the Supabase service-role key here or anywhere in this repository.

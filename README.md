# Moger-mulluk

Top-down 2D browser game: drive through Dhaka traffic from Mohakhali to Banani before the timer runs out.

See `docs/spec.md` for the design and technical spec, and `docs/build-plan.md` for the milestone plan.

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

## Environment variables

Copy `.env.example` to `.env.local` for local development. Both variables are only needed from milestone M8 (the online leaderboard); without them the game builds and runs fully offline.

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anonymous/publishable key |

Never put the Supabase service-role key here or anywhere in this repository.

# Moger-mulluk

Top-down 2D browser game: drive through Dhaka traffic from Mohakhali to Banani before the timer runs out.

- **Spec (source of truth):** `docs/spec.md`
- **Build plan, milestone by milestone:** `docs/build-plan.md`
- **Progress log:** `docs/progress.md` (update at the end of every milestone)

## Stack

Phaser 3 (exact pinned version), TypeScript in strict mode, Vite, Vitest, ESLint, `@supabase/supabase-js` (milestone M8 only). Hosted on Cloudflare Pages. No other runtime dependencies without asking.

## Commands

```
npm run dev        # local dev server
npm run build      # production build to dist/
npm run preview    # serve dist/
npm test           # Vitest
npm run typecheck  # tsc --noEmit
npm run lint       # ESLint
npm run check      # typecheck + lint + test + build; must pass before a task is done
```

## Architecture rules (never break these)

1. **Two layers.** `src/sim/` is the simulation: plain TypeScript, deterministic, fully unit-testable. Everything else (`src/scenes/`, `src/ui/`, `src/online/`, `src/storage.ts`) is presentation and I/O.
2. **`src/sim/` imports nothing from Phaser and touches no browser API**: no `window`, `document`, `localStorage`, `fetch`, `Date.now`, `performance.now`, `Math.random`. ESLint enforces this.
3. **Fixed timestep.** The simulation advances only through `sim.step(dt, input)` with `dt = 1/60` s. The Phaser scene accumulates frame time (capped at 250 ms) and calls `step` zero or more times per frame (spec §12.4).
4. **Seeded randomness only.** All randomness goes through `src/sim/rng.ts`. Same seed + same inputs = same run.
5. **No magic numbers.** Every tunable value lives in `src/sim/config.ts`, grouped by system, each with a comment naming its spec section. Code reads from config.
6. **Units inside the sim:** pixels, px/s, px/s², seconds, degrees in config and radians in code. Milliseconds only at the Phaser boundary and in `duration_ms`.
7. **Coordinates:** x to the right, y down (as in Phaser). The player drives toward decreasing y. Route progress = start y − current y.
8. **The sim emits events.** `step` returns the events that happened that step (collision, near miss, fine, pedestrian hit, finish, fail). HUD, audio and scenes react to events and read state. They never change sim state directly.
9. **No AI.** Traffic and pedestrians follow only the fixed rules in spec §5 and §6. No pathfinding, perception systems, behaviour trees, personalities or decision-making beyond those rules.
10. **No hot-path allocation.** Pool vehicles and pedestrians, reuse arrays and vectors inside `step`.
11. **Storage** only through `src/storage.ts`: keys prefixed `mm.`, every call in try/catch, and the game must work when storage is empty, full or blocked.
12. **Online** only in `src/online/`. No backend code, no server, no service-role key anywhere. Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are read. Gameplay never waits on the network.
13. **Greybox until M9.** Draw vehicles, pedestrians and the road with plain shapes at the exact sizes in the spec. Sprites are swapped in at M9 without changing sizes.

## How to work

- Work on **one milestone at a time** from `docs/build-plan.md`. Never start the next milestone unless asked.
- **Plan first.** At the start of a milestone, read the spec sections it lists, then reply with a plan: files to add or change, tests to write, and any ambiguity or conflict in the spec. Wait for approval before writing code.
- **If the spec is unclear or contradictory, ask.** Don't invent behaviour. If a number is missing, add it to `config.ts` with `// TODO(tune)` and mention it in the summary.
- **Tests:** write Vitest tests for every sim rule alongside the code. Presentation code needs no unit tests.
- **Before saying a task is done,** run `npm run check` and fix all failures.
- **Commit** after each task once `npm run check` passes, with a short message such as `M3: keep-distance rule`.
- **End of milestone:** append an entry to `docs/progress.md` (what was built, how to try it, any deviations from the spec, open questions), then stop and report.

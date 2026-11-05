// §9 Scoring: pure point math, kept separate from `sim.ts`.
import type { SimEvent } from './types';
import { RUN, SCORING } from './config';

/**
 * §9's table only scores near misses, fines and vehicle collisions — kerb/
 * divider contact and pedestrian-hit (an instant fail, not a points event)
 * aren't in that table and score 0. Both 'collision' and 'highSpeed'
 * collision classes score the same -150 ("Collision (any)" in §9). A
 * `vehicleCollision` event with no `collisionClass` is a zero-damage
 * repeated-contact event during the post-hit invulnerability window
 * (§8.1 rule 4) — not a new hit, so it scores 0.
 */
export function scoreForEvent(event: SimEvent): number {
  switch (event.type) {
    case 'nearMiss':
      return SCORING.nearMissPoints;
    case 'fine':
      return SCORING.finePoints;
    case 'vehicleCollision':
      if (!event.collisionClass) return 0;
      return event.collisionClass === 'scrape' ? SCORING.scrapePoints : SCORING.collisionPoints;
    default:
      return 0;
  }
}

/** §9: awarded once, on reaching the finish, in addition to the running score. */
export function finishBonus(elapsedSeconds: number): number {
  const secondsLeft = Math.max(0, RUN.timeLimitSeconds - elapsedSeconds);
  return SCORING.finishPoints + secondsLeft * SCORING.pointsPerSecondLeft;
}

/** §9: star thresholds. Any finish is at least 1 star, even at a low or negative score. */
export function starsForScore(score: number): 1 | 2 | 3 {
  if (score >= SCORING.threeStarThreshold) return 3;
  if (score >= SCORING.twoStarThreshold) return 2;
  return 1;
}

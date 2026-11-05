import { describe, expect, it } from 'vitest';
import { finishBonus, scoreForEvent, starsForScore } from '../../src/sim/scoring';
import { RUN, SCORING } from '../../src/sim/config';
import type { SimEvent } from '../../src/sim/types';

function event(partial: Partial<SimEvent> & { type: SimEvent['type'] }): SimEvent {
  return { healthLost: 0, ...partial };
}

describe('scoreForEvent', () => {
  it('scores a near miss', () => {
    expect(scoreForEvent(event({ type: 'nearMiss' }))).toBe(SCORING.nearMissPoints);
  });

  it('scores a fine', () => {
    expect(scoreForEvent(event({ type: 'fine' }))).toBe(SCORING.finePoints);
  });

  it('scores a scrape collision', () => {
    expect(scoreForEvent(event({ type: 'vehicleCollision', collisionClass: 'scrape' }))).toBe(SCORING.scrapePoints);
  });

  it('scores a collision and a high-speed collision the same', () => {
    expect(scoreForEvent(event({ type: 'vehicleCollision', collisionClass: 'collision' }))).toBe(
      SCORING.collisionPoints,
    );
    expect(scoreForEvent(event({ type: 'vehicleCollision', collisionClass: 'highSpeed' }))).toBe(
      SCORING.collisionPoints,
    );
  });

  it('scores a repeated-contact vehicleCollision (no collisionClass) as zero', () => {
    expect(scoreForEvent(event({ type: 'vehicleCollision' }))).toBe(0);
  });

  it('scores kerb/divider contact and pedestrian hit as zero (not in the §9 table)', () => {
    expect(scoreForEvent(event({ type: 'kerbContact' }))).toBe(0);
    expect(scoreForEvent(event({ type: 'dividerContact' }))).toBe(0);
    expect(scoreForEvent(event({ type: 'pedestrianHit' }))).toBe(0);
  });
});

describe('finishBonus', () => {
  it('awards the full finish points plus a per-second bonus for time left', () => {
    const secondsLeft = 60;
    const elapsed = RUN.timeLimitSeconds - secondsLeft;
    expect(finishBonus(elapsed)).toBe(SCORING.finishPoints + secondsLeft * SCORING.pointsPerSecondLeft);
  });

  it('awards no time bonus once the limit is reached', () => {
    expect(finishBonus(RUN.timeLimitSeconds)).toBe(SCORING.finishPoints);
  });

  it('never goes negative on time bonus, even past the limit', () => {
    expect(finishBonus(RUN.timeLimitSeconds + 10)).toBe(SCORING.finishPoints);
  });
});

describe('starsForScore', () => {
  it('awards 1 star below the two-star threshold, including negative scores', () => {
    expect(starsForScore(0)).toBe(1);
    expect(starsForScore(-500)).toBe(1);
    expect(starsForScore(SCORING.twoStarThreshold - 1)).toBe(1);
  });

  it('awards 2 stars at the two-star threshold', () => {
    expect(starsForScore(SCORING.twoStarThreshold)).toBe(2);
    expect(starsForScore(SCORING.threeStarThreshold - 1)).toBe(2);
  });

  it('awards 3 stars at the three-star threshold', () => {
    expect(starsForScore(SCORING.threeStarThreshold)).toBe(3);
  });
});

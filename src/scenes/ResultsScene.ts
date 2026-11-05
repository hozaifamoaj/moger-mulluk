import Phaser from 'phaser';
import { DISPLAY } from '../sim/config';
import type { FailReason } from '../sim/types';
import * as storage from '../storage';

export interface ResultsData {
  outcome: 'win' | 'fail';
  failReason: FailReason | null;
  score: number;
  durationSeconds: number;
  nearMissCount: number;
  collisionCount: number;
  fineCount: number;
  stars: 0 | 1 | 2 | 3;
  seed: number;
}

interface BestResult {
  score: number;
  stars: 0 | 1 | 2 | 3;
}

// §12.6: one best result per vehicle. Only "car" exists until M7 adds
// vehicle select, but the key is already vehicle-scoped so M7 doesn't need
// to migrate saved data.
const BEST_KEY = 'best.car';

const FAIL_REASON_LABEL: Record<FailReason, string> = {
  time: "Time's up",
  wrecked: 'Your car is wrecked',
  pedestrian: 'You hit a pedestrian',
};

function formatDuration(seconds: number): string {
  const total = Math.floor(seconds);
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm}:${ss.toString().padStart(2, '0')}`;
}

// §10.2 Results: win or fail reason, score, time, near misses, collisions,
// fines, stars; Retry, Menu. No leaderboard rank yet (M8) and no "Change
// vehicle" button yet (M7 adds vehicle select to navigate to).
export class ResultsScene extends Phaser.Scene {
  constructor() {
    super('Results');
  }

  create(data: ResultsData): void {
    const centerX = DISPLAY.width / 2;

    // Opaque, since Game (and whatever's behind it) may still be active
    // underneath rather than stopped.
    this.add.rectangle(0, 0, DISPLAY.width, DISPLAY.height, 0x111317, 1).setOrigin(0, 0);

    // §9/§16: a failed run has no stars and isn't a "result" to best against.
    if (data.outcome === 'win') {
      const best = storage.get<BestResult>(BEST_KEY, { score: -Infinity, stars: 0 });
      if (data.score > best.score) {
        storage.set<BestResult>(BEST_KEY, { score: data.score, stars: data.stars });
      }
    }

    const title = data.outcome === 'win' ? 'Finish!' : FAIL_REASON_LABEL[data.failReason ?? 'time'];
    this.add
      .text(centerX, 150, title, { fontSize: '40px', color: data.outcome === 'win' ? '#55cc55' : '#cc5555' })
      .setOrigin(0.5);

    this.add
      .text(centerX, 210, '★'.repeat(data.stars) + '☆'.repeat(3 - data.stars), { fontSize: '32px', color: '#ffee66' })
      .setOrigin(0.5);

    const lines = [
      `Score: ${Math.round(data.score)}`,
      `Time: ${formatDuration(data.durationSeconds)}`,
      `Near misses: ${data.nearMissCount}`,
      `Collisions: ${data.collisionCount}`,
      `Fines: ${data.fineCount}`,
      `Seed: ${data.seed}`,
    ];
    this.add
      .text(centerX, 280, lines.join('\n'), { fontSize: '22px', color: '#ffffff', align: 'center', lineSpacing: 10 })
      .setOrigin(0.5, 0);

    const makeButton = (y: number, label: string, onClick: () => void): void => {
      this.add
        .text(centerX, y, label, {
          fontSize: '26px',
          color: '#ffffff',
          backgroundColor: '#2a7a4f',
          padding: { x: 24, y: 10 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', onClick);
    };

    makeButton(600, 'Retry', () => this.scene.start('Game'));
    makeButton(660, 'Menu', () => this.scene.start('Menu'));
  }
}

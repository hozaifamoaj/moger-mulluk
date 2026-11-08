import Phaser from 'phaser';
import { DISPLAY } from '../sim/config';
import type { FailReason, PlayableVehicleId } from '../sim/types';
import * as storage from '../storage';
import { bestKey, getAllBests, persistUnlocks, totalStars, type BestResult } from '../vehicles';
import { getSettings } from '../settings';
import { FONT_FAMILY, t, type StringKey } from '../ui/strings';

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
  vehicleId: PlayableVehicleId;
}

const FAIL_REASON_LABEL: Record<FailReason, StringKey> = {
  time: 'failTime',
  wrecked: 'failWrecked',
  pedestrian: 'failPedestrian',
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
    const { language } = getSettings();
    const centerX = DISPLAY.width / 2;

    // Opaque, since Game (and whatever's behind it) may still be active
    // underneath rather than stopped.
    this.add.rectangle(0, 0, DISPLAY.width, DISPLAY.height, 0x111317, 1).setOrigin(0, 0);

    // §9/§16: a failed run has no stars and isn't a "result" to best against.
    if (data.outcome === 'win') {
      const key = bestKey(data.vehicleId);
      const best = storage.get<BestResult>(key, { score: -Infinity, stars: 0 });
      if (data.score > best.score) {
        storage.set<BestResult>(key, { score: data.score, stars: data.stars });
      }
      persistUnlocks(totalStars(getAllBests()));
    }

    const title = data.outcome === 'win' ? t('finish', language) : t(FAIL_REASON_LABEL[data.failReason ?? 'time'], language);
    this.add
      .text(centerX, 150, title, {
        fontSize: '40px',
        color: data.outcome === 'win' ? '#55cc55' : '#cc5555',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

    this.add
      .text(centerX, 210, '★'.repeat(data.stars) + '☆'.repeat(3 - data.stars), { fontSize: '32px', color: '#ffee66' })
      .setOrigin(0.5);

    const lines = [
      `${t('scoreLabel', language)}: ${Math.round(data.score)}`,
      `${t('timeLabel', language)}: ${formatDuration(data.durationSeconds)}`,
      `${t('nearMissesLabel', language)}: ${data.nearMissCount}`,
      `${t('collisionsLabel', language)}: ${data.collisionCount}`,
      `${t('finesLabel', language)}: ${data.fineCount}`,
      `${t('seedLabel', language)}: ${data.seed}`,
    ];
    this.add
      .text(centerX, 280, lines.join('\n'), {
        fontSize: '22px',
        color: '#ffffff',
        align: 'center',
        lineSpacing: 10,
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5, 0);

    const makeButton = (y: number, label: string, onClick: () => void): void => {
      this.add
        .text(centerX, y, label, {
          fontSize: '26px',
          color: '#ffffff',
          backgroundColor: '#2a7a4f',
          padding: { x: 24, y: 10 },
          fontFamily: FONT_FAMILY,
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', onClick);
    };

    makeButton(540, t('retry', language), () => this.scene.start('Game', { vehicleId: data.vehicleId }));
    makeButton(600, t('changeVehicle', language), () => this.scene.start('VehicleSelect'));
    makeButton(660, t('menu', language), () => this.scene.start('Menu'));
  }
}

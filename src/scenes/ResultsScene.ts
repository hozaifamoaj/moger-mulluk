import Phaser from 'phaser';
import { DISPLAY } from '../sim/config';
import type { FailReason, PlayableVehicleId } from '../sim/types';
import * as storage from '../storage';
import { bestKey, getAllBests, persistUnlocks, totalStars, type BestResult } from '../vehicles';
import { getSettings, setSettings, type Language } from '../settings';
import { FONT_FAMILY, t, type StringKey } from '../ui/strings';
import { getClient } from '../online/client';
import { signInIfNeeded, submitScore, queryRank, type ScoreSubmission } from '../online/leaderboard';
import { buildScorePayload } from '../online/scorePayload';
import { enqueuePending } from '../online/pending';
import { showIdentityPrompt } from '../ui/identityPrompt';
import pkg from '../../package.json';

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
// fines, stars, leaderboard rank; Retry, Change vehicle, Menu.
export class ResultsScene extends Phaser.Scene {
  private rankText!: Phaser.GameObjects.Text;

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

    this.rankText = this.add
      .text(centerX, 500, '', { fontSize: '18px', color: '#ffee66', fontFamily: FONT_FAMILY })
      .setOrigin(0.5);

    if (data.outcome === 'win') void this.submitOnline(data, language);

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

  // §10.2/§12.7: submits a win to the leaderboard. Nickname + a human check
  // are only ever asked for here, at the one moment a score is about to be
  // written — reading the leaderboard (Menu/LeaderboardScene) needs neither.
  private async submitOnline(data: ResultsData, language: Language): Promise<void> {
    const client = getClient();
    if (!client) return;

    const settings = getSettings();
    let nickname = settings.nickname;
    let signedIn = await signInIfNeeded(client);

    if (!nickname || !signedIn) {
      const result = await showIdentityPrompt({
        title: t('nicknamePromptTitle', language),
        nicknameLabel: t('nicknameLabel', language),
        confirmLabel: t('confirm', language),
        skipLabel: t('skip', language),
        errorMessages: {
          tooShort: t('nicknameTooShort', language),
          tooLong: t('nicknameTooLong', language),
          blocked: t('nicknameBlocked', language),
        },
        needsNickname: !nickname,
        needsCaptcha: !signedIn,
        initialNickname: nickname ?? undefined,
      });
      if (!result) return; // player skipped; no submission, no rank shown

      if (result.nickname !== null) {
        nickname = result.nickname;
        setSettings({ ...settings, nickname });
      }
      if (!signedIn) signedIn = await signInIfNeeded(client, result.captchaToken ?? undefined);
    }

    if (!nickname || !signedIn) return;

    const payload: ScoreSubmission | null = buildScorePayload(data, nickname, pkg.version);
    if (!payload) return;

    const submitResult = await submitScore(client, payload);
    if (!submitResult.ok) {
      if (submitResult.reason !== 'rate_limited') enqueuePending(payload);
      this.rankText.setText(t('leaderboardUnavailable', language));
      return;
    }

    const rank = await queryRank(client, payload.vehicle, payload.score);
    if (rank !== null) this.rankText.setText(`${t('rankLabel', language)}: #${rank}`);
  }
}

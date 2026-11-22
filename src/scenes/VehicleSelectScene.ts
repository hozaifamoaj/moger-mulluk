import Phaser from 'phaser';
import { DISPLAY, UNLOCKS, VEHICLES } from '../sim/config';
import type { PlayableVehicleId } from '../sim/types';
import { getUnlockedIds } from '../vehicles';
import { getSettings, type Language } from '../settings';
import { FONT_FAMILY, t } from '../ui/strings';

const VEHICLE_IDS: PlayableVehicleId[] = ['car', 'motorcycle'];

const CARD = {
  width: 300,
  height: 420,
  gap: 40,
  top: 260,
  previewScale: 2.5, // greybox preview only; real in-run sizes come from VEHICLES directly (rule 13)
  maxPreviewHeight: 140, // caps longer vehicles' preview so it can't overlap the name label below it
} as const;

// §10.2 Vehicle select: image, name, speed, handling, health, lock status.
// Per the approved plan, "handling" is shown as the raw config numbers
// (max speed, acceleration, steering, health) rather than a computed rating.
export class VehicleSelectScene extends Phaser.Scene {
  constructor() {
    super('VehicleSelect');
  }

  create(): void {
    const { language } = getSettings();
    const centerX = DISPLAY.width / 2;
    const unlockedIds = getUnlockedIds();

    this.add.rectangle(0, 0, DISPLAY.width, DISPLAY.height, 0x111317, 1).setOrigin(0, 0);
    this.add
      .text(centerX, 120, t('vehicleSelectTitle', language), {
        fontSize: '36px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

    const totalWidth = VEHICLE_IDS.length * CARD.width + (VEHICLE_IDS.length - 1) * CARD.gap;
    let x = centerX - totalWidth / 2 + CARD.width / 2;

    for (const id of VEHICLE_IDS) {
      this.drawCard(id, x, language, unlockedIds.includes(id));
      x += CARD.width + CARD.gap;
    }

    const back = this.add
      .text(centerX, DISPLAY.height - 60, t('back', language), {
        fontSize: '22px',
        color: '#ffffff',
        backgroundColor: '#444444',
        padding: { x: 20, y: 8 },
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    back.on('pointerup', () => this.scene.start('Menu'));
  }

  private drawCard(id: PlayableVehicleId, x: number, language: Language, unlocked: boolean): void {
    const config = VEHICLES[id];
    const top = CARD.top;

    this.add
      .rectangle(x, top + CARD.height / 2, CARD.width, CARD.height, 0x24262b, 1)
      .setStrokeStyle(2, unlocked ? 0x55cc55 : 0x555555);

    this.add
      .rectangle(
        x,
        top + 90,
        config.width * CARD.previewScale,
        Math.min(config.length * CARD.previewScale, CARD.maxPreviewHeight),
        0xe0e0e0,
        unlocked ? 1 : 0.3,
      )
      .setOrigin(0.5);

    this.add
      .text(x, top + 180, config.name, { fontSize: '26px', color: '#ffffff', fontFamily: FONT_FAMILY })
      .setOrigin(0.5);

    const stats = [
      `${t('maxSpeedLabel', language)}: ${config.maxSpeed}`,
      `${t('accelerationLabel', language)}: ${config.acceleration}`,
      `${t('steeringLabel', language)}: ${config.steerRate}`,
      `${t('healthLabel', language)}: ${config.health}`,
    ];
    this.add
      .text(x, top + 220, stats.join('\n'), {
        fontSize: '16px',
        color: '#cccccc',
        align: 'center',
        lineSpacing: 6,
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5, 0);

    if (unlocked) {
      const button = this.add
        .text(x, top + CARD.height - 40, t('play', language), {
          fontSize: '22px',
          color: '#ffffff',
          backgroundColor: '#2a7a4f',
          padding: { x: 20, y: 8 },
          fontFamily: FONT_FAMILY,
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .setName(`select-${id}-button`);
      button.on('pointerup', () => this.scene.start('Game', { vehicleId: id }));
    } else {
      this.add
        .text(x, top + CARD.height - 40, `${t('locked', language)}: ${UNLOCKS[id]} ${t('starsNeeded', language)}`, {
          fontSize: '16px',
          color: '#999999',
          align: 'center',
          fontFamily: FONT_FAMILY,
        })
        .setOrigin(0.5);
    }
  }
}

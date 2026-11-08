import Phaser from 'phaser';
import { DISPLAY } from '../sim/config';
import { getSettings } from '../settings';
import { FONT_FAMILY, t } from '../ui/strings';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    const { language } = getSettings();
    const centerX = DISPLAY.width / 2;

    this.add
      .text(centerX, 380, t('gameTitle', language), { fontSize: '48px', color: '#ffffff', fontFamily: FONT_FAMILY })
      .setOrigin(0.5);

    const playButton = this.add
      .text(centerX, 560, t('play', language), {
        fontSize: '32px',
        color: '#ffffff',
        backgroundColor: '#2a7a4f',
        padding: { x: 24, y: 12 },
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setName('play-button');

    playButton.on('pointerup', () => this.scene.start('VehicleSelect'));

    const settingsButton = this.add
      .text(centerX, 630, t('settings', language), {
        fontSize: '26px',
        color: '#ffffff',
        backgroundColor: '#444444',
        padding: { x: 24, y: 10 },
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    settingsButton.on('pointerup', () => this.scene.start('Settings'));

    // §3.2 Controls: shown here too for desktop players, since touch players
    // see the on-screen buttons directly instead.
    if (!this.sys.game.device.input.touch) {
      this.add
        .text(centerX, 700, t('controlsHint', language), {
          fontSize: '18px',
          color: '#cccccc',
          fontFamily: FONT_FAMILY,
        })
        .setOrigin(0.5);
    }
  }
}

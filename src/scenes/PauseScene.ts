import Phaser from 'phaser';
import { DISPLAY } from '../sim/config';
import { getSettings } from '../settings';
import { FONT_FAMILY, t } from '../ui/strings';
import type { GameScene } from './GameScene';

// §3.5 Paused state: launched on top of Game (which is scene.pause()'d, so
// it stops updating/stepping) rather than modelled as sim state.
export class PauseScene extends Phaser.Scene {
  constructor() {
    super('Pause');
  }

  create(): void {
    const { language } = getSettings();
    const centerX = DISPLAY.width / 2;

    this.add
      .rectangle(0, 0, DISPLAY.width, DISPLAY.height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setScrollFactor(0);

    this.add
      .text(centerX, 420, t('paused', language), { fontSize: '40px', color: '#ffffff', fontFamily: FONT_FAMILY })
      .setOrigin(0.5);

    const makeButton = (y: number, label: string, onClick: () => void): void => {
      this.add
        .text(centerX, y, label, {
          fontSize: '28px',
          color: '#ffffff',
          backgroundColor: '#2a7a4f',
          padding: { x: 24, y: 12 },
          fontFamily: FONT_FAMILY,
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', onClick);
    };

    makeButton(520, t('resume', language), () => {
      (this.scene.get('Game') as GameScene).resumeFromPause();
      this.scene.stop();
      this.scene.resume('Game');
    });

    makeButton(590, t('restart', language), () => {
      // §3.2/§4.1: preserve the vehicle the player was running before the
      // restart, read off the still-live Game scene instance.
      const vehicleId = (this.scene.get('Game') as GameScene).currentVehicleId;
      this.scene.stop();
      this.scene.stop('Game');
      this.scene.start('Game', { vehicleId });
    });

    makeButton(660, t('quitToMenu', language), () => {
      this.scene.stop();
      this.scene.stop('Game');
      this.scene.start('Menu');
    });
  }
}

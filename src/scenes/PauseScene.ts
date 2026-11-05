import Phaser from 'phaser';
import { DISPLAY } from '../sim/config';
import type { GameScene } from './GameScene';

// §3.5 Paused state: launched on top of Game (which is scene.pause()'d, so
// it stops updating/stepping) rather than modelled as sim state.
export class PauseScene extends Phaser.Scene {
  constructor() {
    super('Pause');
  }

  create(): void {
    const centerX = DISPLAY.width / 2;

    this.add
      .rectangle(0, 0, DISPLAY.width, DISPLAY.height, 0x000000, 0.6)
      .setOrigin(0, 0)
      .setScrollFactor(0);

    this.add.text(centerX, 420, 'Paused', { fontSize: '40px', color: '#ffffff' }).setOrigin(0.5);

    const makeButton = (y: number, label: string, onClick: () => void): void => {
      this.add
        .text(centerX, y, label, {
          fontSize: '28px',
          color: '#ffffff',
          backgroundColor: '#2a7a4f',
          padding: { x: 24, y: 12 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', onClick);
    };

    makeButton(520, 'Resume', () => {
      (this.scene.get('Game') as GameScene).resumeFromPause();
      this.scene.stop();
      this.scene.resume('Game');
    });

    makeButton(590, 'Restart', () => {
      this.scene.stop();
      this.scene.stop('Game');
      this.scene.start('Game');
    });

    makeButton(660, 'Quit to menu', () => {
      this.scene.stop();
      this.scene.stop('Game');
      this.scene.start('Menu');
    });
  }
}

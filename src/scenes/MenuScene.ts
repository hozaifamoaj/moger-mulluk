import Phaser from 'phaser';
import { DISPLAY } from '../sim/config';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    const centerX = DISPLAY.width / 2;

    this.add
      .text(centerX, 420, 'Moger-mulluk', { fontSize: '48px', color: '#ffffff' })
      .setOrigin(0.5);

    const playButton = this.add
      .text(centerX, 600, 'Play', {
        fontSize: '32px',
        color: '#ffffff',
        backgroundColor: '#2a7a4f',
        padding: { x: 24, y: 12 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    playButton.on('pointerup', () => this.scene.start('Game'));
  }
}

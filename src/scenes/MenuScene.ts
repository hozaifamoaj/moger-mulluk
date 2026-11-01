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
      .setInteractive({ useHandCursor: true })
      .setName('play-button');

    playButton.on('pointerup', () => this.scene.start('Game'));

    // §3.2 Controls: shown here too since M2 only has keyboard input (touch
    // buttons arrive in M7) and nothing else tells the player the bindings.
    this.add
      .text(centerX, 700, 'W/↑ Gas   S/↓ Brake   A/D or ←/→ Steer   Space Horn', {
        fontSize: '18px',
        color: '#cccccc',
      })
      .setOrigin(0.5);
  }
}

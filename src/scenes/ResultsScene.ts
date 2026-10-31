import Phaser from 'phaser';
import { DISPLAY } from '../sim/config';

export class ResultsScene extends Phaser.Scene {
  constructor() {
    super('Results');
  }

  create(): void {
    this.add
      .text(DISPLAY.width / 2, 640, 'Results', { fontSize: '32px', color: '#ffffff' })
      .setOrigin(0.5);
  }
}

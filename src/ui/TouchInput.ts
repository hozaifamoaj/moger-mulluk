import Phaser from 'phaser';
import { DISPLAY } from '../sim/config';
import type { Input } from '../sim/types';

const BUTTON = {
  size: 72,
  margin: 16,
  gap: 12,
  alpha: 0.35,
  color: 0xffffff,
} as const;

/**
 * §3.2/§10.1 touch controls: steering buttons bottom-left, gas/brake/horn
 * bottom-right, shown only on touch devices. Same `Input`-shape `read()` as
 * KeyboardInput, so GameScene merges both with simple OR logic.
 */
export class TouchInput {
  private leftDown = false;
  private rightDown = false;
  private throttleDown = false;
  private brakeDown = false;
  private hornDown = false;

  constructor(scene: Phaser.Scene) {
    const bottom = DISPLAY.height - BUTTON.margin - BUTTON.size / 2;

    const leftX = BUTTON.margin + BUTTON.size / 2;
    const rightX = leftX + BUTTON.size + BUTTON.gap;
    this.makeButton(scene, leftX, bottom, '◀', (down) => (this.leftDown = down));
    this.makeButton(scene, rightX, bottom, '▶', (down) => (this.rightDown = down));

    const hornX = DISPLAY.width - BUTTON.margin - BUTTON.size / 2;
    const brakeX = hornX - BUTTON.size - BUTTON.gap;
    const throttleX = brakeX - BUTTON.size - BUTTON.gap;
    this.makeButton(scene, throttleX, bottom, '▲', (down) => (this.throttleDown = down));
    this.makeButton(scene, brakeX, bottom, '■', (down) => (this.brakeDown = down));
    this.makeButton(scene, hornX, bottom, '♪', (down) => (this.hornDown = down));
  }

  read(): Input {
    const steer: Input['steer'] = this.leftDown === this.rightDown ? 0 : this.leftDown ? -1 : 1;
    return {
      throttle: this.throttleDown ? 1 : 0,
      brake: this.brakeDown ? 1 : 0,
      steer,
      horn: this.hornDown,
    };
  }

  private makeButton(scene: Phaser.Scene, x: number, y: number, label: string, setDown: (down: boolean) => void): void {
    const button = scene.add
      .rectangle(x, y, BUTTON.size, BUTTON.size, BUTTON.color, BUTTON.alpha)
      .setScrollFactor(0)
      .setDepth(3000)
      .setInteractive();

    scene.add.text(x, y, label, { fontSize: '28px', color: '#ffffff' }).setOrigin(0.5).setScrollFactor(0).setDepth(3001);

    button.on('pointerdown', () => setDown(true));
    button.on('pointerup', () => setDown(false));
    button.on('pointerout', () => setDown(false));
  }
}

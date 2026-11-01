import Phaser from 'phaser';
import type { Input } from '../sim/types';

const { KeyCodes } = Phaser.Input.Keyboard;

/**
 * §3.2 Controls: WASD and arrow keys, mapped to the sim's device-agnostic
 * `Input` shape each frame. Touch controls arrive in M7.
 */
export class KeyboardInput {
  private readonly accelerate: Phaser.Input.Keyboard.Key[];
  private readonly brake: Phaser.Input.Keyboard.Key[];
  private readonly left: Phaser.Input.Keyboard.Key[];
  private readonly right: Phaser.Input.Keyboard.Key[];
  private readonly horn: Phaser.Input.Keyboard.Key;

  constructor(scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard input plugin is not available on this scene.');
    }

    this.accelerate = [keyboard.addKey(KeyCodes.W), keyboard.addKey(KeyCodes.UP)];
    this.brake = [keyboard.addKey(KeyCodes.S), keyboard.addKey(KeyCodes.DOWN)];
    this.left = [keyboard.addKey(KeyCodes.A), keyboard.addKey(KeyCodes.LEFT)];
    this.right = [keyboard.addKey(KeyCodes.D), keyboard.addKey(KeyCodes.RIGHT)];
    this.horn = keyboard.addKey(KeyCodes.SPACE);
  }

  read(): Input {
    const left = anyDown(this.left);
    const right = anyDown(this.right);
    const steer: Input['steer'] = left === right ? 0 : left ? -1 : 1;

    return {
      throttle: anyDown(this.accelerate) ? 1 : 0,
      brake: anyDown(this.brake) ? 1 : 0,
      steer,
      horn: this.horn.isDown,
    };
  }
}

function anyDown(keys: readonly Phaser.Input.Keyboard.Key[]): boolean {
  return keys.some((key) => key.isDown);
}

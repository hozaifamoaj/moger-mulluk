import Phaser from 'phaser';
import { DISPLAY } from './sim/config';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { ResultsScene } from './scenes/ResultsScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: DISPLAY.width,
  height: DISPLAY.height,
  parent: 'app',
  backgroundColor: '#111317',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, MenuScene, GameScene, ResultsScene],
});

// §3.5: the game pauses automatically when the browser tab is hidden.
document.addEventListener('visibilitychange', () => {
  for (const scene of game.scene.getScenes(true)) {
    if (document.hidden) {
      scene.scene.pause();
    } else {
      scene.scene.resume();
    }
  }
});

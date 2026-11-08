import Phaser from 'phaser';
import { DISPLAY } from './sim/config';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { VehicleSelectScene } from './scenes/VehicleSelectScene';
import { SettingsScene } from './scenes/SettingsScene';
import { GameScene } from './scenes/GameScene';
import { PauseScene } from './scenes/PauseScene';
import { ResultsScene } from './scenes/ResultsScene';
import { LeaderboardScene } from './scenes/LeaderboardScene';

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
  scene: [BootScene, MenuScene, VehicleSelectScene, SettingsScene, GameScene, PauseScene, ResultsScene, LeaderboardScene],
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

// Expose the game instance for Playwright e2e tests (see e2e/). `import.meta.env.DEV`
// is replaced at build time, so this branch — and the reference to `game` — is dropped
// from production builds entirely; it never ships.
if (import.meta.env.DEV) {
  (window as Window & { __game?: Phaser.Game }).__game = game;
}

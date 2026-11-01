import { test, expect } from '@playwright/test';
import type { Game } from 'phaser';

// The dev-only hook `main.ts` attaches to `window` (stripped from production
// builds) so these tests can read real Phaser scene state instead of guessing
// from pixels or fighting synthetic-event limitations against the canvas.
declare global {
  interface Window {
    __game?: Game;
  }
}

test('boots into the Menu scene and Play transitions to Game', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => window.__game?.scene.isActive('Menu') === true);

  // Find the Play button through Phaser's own scene graph (by the name set in
  // MenuScene.ts) and map its bounds to page coordinates through the canvas's
  // actual CSS box, since Scale.FIT can scale the 720x1280 logical resolution
  // to any viewport size.
  const target = await page.evaluate(() => {
    const game = window.__game!;
    const menu = game.scene.getScene('Menu');
    const play = menu.children.getByName('play-button') as Phaser.GameObjects.Text;
    const bounds = play.getBounds();
    const rect = game.canvas.getBoundingClientRect();
    const scaleX = rect.width / game.scale.width;
    const scaleY = rect.height / game.scale.height;
    return {
      x: rect.left + (bounds.x + bounds.width / 2) * scaleX,
      y: rect.top + (bounds.y + bounds.height / 2) * scaleY,
    };
  });

  await page.mouse.click(target.x, target.y);

  await page.waitForFunction(() => window.__game?.scene.isActive('Game') === true);
  expect(await page.evaluate(() => window.__game?.scene.isActive('Menu'))).toBe(false);
});

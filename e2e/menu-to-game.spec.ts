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

// Maps a named game object's bounds (in the given scene) to real page
// coordinates, since Scale.FIT can scale the 720x1280 logical resolution to
// any viewport size.
async function clickByName(page: import('@playwright/test').Page, sceneKey: string, name: string): Promise<void> {
  const target = await page.evaluate(
    ({ sceneKey, name }) => {
      const game = window.__game!;
      const scene = game.scene.getScene(sceneKey);
      const obj = scene.children.getByName(name) as Phaser.GameObjects.Text;
      const bounds = obj.getBounds();
      const rect = game.canvas.getBoundingClientRect();
      const scaleX = rect.width / game.scale.width;
      const scaleY = rect.height / game.scale.height;
      return {
        x: rect.left + (bounds.x + bounds.width / 2) * scaleX,
        y: rect.top + (bounds.y + bounds.height / 2) * scaleY,
      };
    },
    { sceneKey, name },
  );

  await page.mouse.click(target.x, target.y);
}

test('boots into the Menu scene and Play transitions through Vehicle Select into Game', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => window.__game?.scene.isActive('Menu') === true);

  await clickByName(page, 'Menu', 'play-button');

  await page.waitForFunction(() => window.__game?.scene.isActive('VehicleSelect') === true);
  expect(await page.evaluate(() => window.__game?.scene.isActive('Menu'))).toBe(false);

  await clickByName(page, 'VehicleSelect', 'select-car-button');

  await page.waitForFunction(() => window.__game?.scene.isActive('Game') === true);
  expect(await page.evaluate(() => window.__game?.scene.isActive('VehicleSelect'))).toBe(false);
});

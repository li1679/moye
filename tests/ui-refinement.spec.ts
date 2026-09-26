import { expect, test } from '@playwright/test';

test.describe('墨页 UI refinement', () => {
  test('uses the new product name and keeps compact controls tappable', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('墨页');

    await page.setViewportSize({ width: 360, height: 740 });
    const controls = page.locator('.icon, .chapter-step, .reader-bottom button, .steps button');
    const count = await controls.count();
    for (let index = 0; index < count; index += 1) {
      const box = await controls.nth(index).boundingBox();
      if (box) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('does not impose a 390px settings minimum in short landscape', async ({ page }) => {
    await page.setViewportSize({ width: 740, height: 320 });
    await page.goto('/');
    const settings = page.locator('.settings-sheet');
    if (await settings.count()) {
      const box = await settings.first().boundingBox();
      if (box) expect(box.height).toBeLessThanOrEqual(304);
    }
  });
});

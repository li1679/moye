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

  test('uses full-width navigation and paper-ink sheet controls', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/');
    const nav = page.locator('.bottom-nav');
    const navBox = (await nav.boundingBox())!;
    expect(navBox.x).toBe(0);
    expect(navBox.width).toBe(360);
    const indicator = await page.locator('.bottom-nav button.active').evaluate(button => {
      const style = getComputedStyle(button, '::before');
      return { width: style.width, height: style.height, color: style.backgroundColor };
    });
    expect(indicator).toEqual({ width: '24px', height: '2px', color: 'rgb(179, 58, 46)' });

    await page.locator('[data-action="new-book"]').click();
    const sheet = page.locator('#sheet');
    await expect(sheet).toHaveCSS('background-color', 'rgb(251, 248, 242)');
    expect(await sheet.evaluate(el => getComputedStyle(el, '::before').display)).toBe('none');
    await expect(sheet.locator('.primary')).toHaveCSS('background-color', 'rgb(31, 29, 26)');
    await expect(sheet.locator('.primary')).toHaveCSS('color', 'rgb(251, 248, 242)');
  });
});

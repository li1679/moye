import { expect, test } from './seed';
import type { Page } from '@playwright/test';

async function openEditor(page: Page) {
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  await page.locator('[data-action="chapter:0"]').click();
}

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

  test('uses the dark paper color for the application shell', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('.home')).toHaveCSS('background-color', 'rgb(27, 26, 24)');
  });

  test('serves the generated Moye seal as the favicon', async ({ page, request }) => {
    await page.goto('/');
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/brand/moye.svg');
    const response = await request.get('/brand/moye.svg');
    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain('viewBox="0 0 108 108"');
  });

  test('marks the editor top toolbar as overflowing at 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await openEditor(page);
    await expect(page.locator('.editor-tools')).toHaveClass(/\boverflowing\b/);
  });

  test('shows the tool name after a long press without running the tool', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await openEditor(page);
    const manuscript = page.getByRole('textbox', { name: '章节正文', exact: true });
    await manuscript.fill('长按前正文');
    const undo = page.locator('[data-action="tool:undo"]');
    const box = await undo.boundingBox();
    if (!box) throw new Error('撤销按钮不可见');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();
    await expect(page.locator('#notice')).toHaveText('撤销');
    await expect(manuscript).toHaveText('长按前正文');
  });
});

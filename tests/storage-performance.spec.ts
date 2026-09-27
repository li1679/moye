import { test, expect } from './seed';

test('nested preference changes use the normal persistence path', async ({ page }) => {
  await page.goto('/');
  const openFontSettings = async () => {
    await page.locator('[data-action="book:1"]').click();
    await page.locator('[data-action="chapter:0"]').click();
    await page.locator('[data-action="tool:settings"]').click();
    await page.locator('[data-action="settings:字体"]').click();
  };
  await openFontSettings();
  await page.locator('[data-action="pref:font:18"]').click();
  await expect(page.locator('[data-action="pref:font:18"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.save-status')).toHaveText('已保存');
  await page.reload();
  await openFontSettings();
  await expect(page.locator('[data-action="pref:font:18"]')).toHaveAttribute('aria-pressed', 'true');
});

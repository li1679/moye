import { test, expect } from './seed';

test('migrated prototype preserves navigation and chapter editing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.books')).toBeVisible();
  await expect(page.locator('svg').first()).toBeVisible();
  await page.locator('.folder-open').first().click();
  await expect(page.locator('.bottom-nav')).toHaveCount(0);
  await page.getByRole('button', { name: '返回书架', exact: true }).click();
  await page.locator('[data-action^="book:"]').first().click();
  await expect(page.locator('.chapter-page')).toBeVisible();
  await page.locator('[data-action^="chapter:"]').first().click();
  await expect(page.getByRole('textbox', { name: '章节正文', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: '章节正文', exact: true }).fill('整章编辑验证\n\n第二段正文');
  await expect(page.getByRole('textbox', { name: '章节正文', exact: true })).toContainText('第二段正文');
  await page.screenshot({ path: 'test-results/editor-mobile.png' });
  expect(errors).toEqual([]);
});

for (const width of [320, 1280]) {
  test(`library fits width ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 790 });
    await page.goto('/');
    await expect(page.locator('.books')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/library-${width}.png` });
  });
}

import { test, expect } from './seed';

test('字数不含空白', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  await page.locator('[data-action="chapter:0"]').click();
  const body = page.getByRole('textbox', { name: '章节正文', exact: true });
  await body.fill('甲 乙\n丙');
  await expect(page.locator('#word-value')).toHaveText('3');
  await page.getByRole('button', { name: '返回目录', exact: true }).click();
  await expect(page.locator('[data-action="chapter:0"]')).toContainText('3 字');
});

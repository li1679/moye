import { test, expect } from '@playwright/test';
import { toShelf } from './seed';

test('new install is empty, saved status fades and cache leaves book intact', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.books')).toBeVisible();
  await expect(page.locator('.book, .folder-open')).toHaveCount(0);
  await expect(page.locator('.save-status')).toBeHidden({ timeout: 4000 });
  await page.getByRole('button', { name: '新建书籍', exact: true }).click();
  await page.locator('#book-name').fill('个人作品');
  await page.locator('#book-form button[type="submit"]').click();
  await expect(page.locator('.book')).toContainText('个人作品');
  await page.locator('[data-action="tab:me"]').click();
  await page.locator('[data-action="cache"]').click();
  await expect(page.locator('.sheet-content')).not.toContainText('预览');
  await page.locator('[data-action="clear-cache"]').click();
  await expect(page.locator('#cache-result')).toHaveText('缓存已清理');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.locator('.save-status')).toBeHidden({ timeout: 4000 });
  await page.reload();
  await toShelf(page);
  await expect(page.locator('.book')).toContainText('个人作品');
});

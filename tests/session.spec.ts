import { test, expect } from './seed';

test('编辑第 2 章后刷新，直接回到第 2 章的编辑器', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  await page.locator('[data-action="chapter:1"]').click();
  await expect(page.getByRole('textbox', { name: '章节标题', exact: true })).toHaveText('第2章  旧书店');
  await expect(page.locator('.save-status')).toHaveText('已保存');
  await page.reload();
  await expect(page.locator('.editor')).toBeVisible();
  await expect(page.getByRole('textbox', { name: '章节标题', exact: true })).toHaveText('第2章  旧书店');
});

test('阅读到第 2 章后刷新，直接回到阅读器第 2 章', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="tab:read"]').click();
  await page.locator('[data-action="book:1"]').click();
  const box = await page.locator('.editor-scroll').boundingBox();
  await page.locator('.editor-scroll').click({ position: { x: box!.width / 2, y: box!.height / 2 } });   // 呼出控制栏
  await expect(page.locator('.reader.controls')).toBeVisible();
  await page.locator('[data-action="reader-step:1"]').click();
  await expect(page.locator('.reader-footer span').first()).toHaveText('第2章  旧书店');
  await expect(page.locator('.save-status')).toHaveText('已保存');
  await page.reload();
  await expect(page.locator('.reader')).toBeVisible();
  await expect(page.locator('.reader-footer span').first()).toHaveText('第2章  旧书店');
});

test('在"阅读"书架刷新，仍然在"阅读"书架', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="tab:read"]').click();
  await expect(page.locator('.save-status')).toHaveText('已保存');
  await page.reload();
  await expect(page.locator('.bottom-nav .active')).toContainText('阅读');
});

test('删除当前的书后刷新，回到书架', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  await page.getByRole('button', { name: '书籍菜单', exact: true }).click();
  await page.locator('[data-action="delete-book"]').click();
  await page.locator('[data-action="confirm-book"]').click();
  await expect(page.locator('.save-status')).toHaveText('已保存');
  await page.reload();
  await expect(page.locator('.books')).toBeVisible();
  await expect(page.locator('[data-action="book:1"]')).toHaveCount(0);
});

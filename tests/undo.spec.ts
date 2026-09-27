import { test, expect } from './seed';
import { toShelf } from './seed';

test('deleting a book can be undone within five seconds', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  await page.getByRole('button', { name: '书籍菜单', exact: true }).click();
  await page.locator('[data-action="delete-book"]').click();
  await page.locator('[data-action="confirm-book"]').click();
  await expect(page.locator('#notice')).toContainText('已删除《雨停之后》');
  await page.locator('[data-action="notice-action"]').click();
  await expect(page.locator('[data-action="book:1"]')).toBeVisible();
  await expect(page.locator('.save-status')).toHaveText('已保存');
  await page.reload();
  await toShelf(page);
  await expect(page.locator('[data-action="book:1"]')).toBeVisible();
});

test('deleting chapters can be undone', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  await page.getByRole('button', { name: '管理章节', exact: true }).click();
  await page.locator('[data-action="select-chapter:0"]').click();
  await page.locator('[data-action="select-chapter:2"]').click();
  await page.locator('[data-action="delete-chapters"]').click();
  await page.locator('[data-action="confirm-chapters"]').click();
  await expect(page.locator('#notice')).toContainText('已删除 2 章');
  await page.locator('[data-action="notice-action"]').click();
  await expect(page.locator('[data-chapter-index]')).toHaveCount(3);
  await expect(page.locator('[data-action="select-chapter:0"]')).toContainText('归途');
  await expect(page.locator('[data-action="select-chapter:1"]')).toContainText('旧书店');
  await expect(page.locator('[data-action="select-chapter:2"]')).toContainText('一封来信');
});

test('deleted book positions are removed', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="tab:read"]').click();
  await page.locator('[data-action="book:1"]').click();
  await expect(page.locator('.reader')).toBeVisible();
  await expect(page.locator('.save-status')).toHaveText('已保存');
  const box = await page.locator('.editor-scroll').boundingBox();
  await page.locator('.editor-scroll').click({ position: { x: box!.width / 2, y: box!.height / 2 } });   // 呼出控制栏
  await expect(page.locator('.reader.controls')).toBeVisible();
  await page.locator('[data-action="home"]').click();
  await page.locator('[data-action="tab:edit"]').click();
  await page.locator('[data-action="book:1"]').click();
  await page.getByRole('button', { name: '书籍菜单', exact: true }).click();
  await page.locator('[data-action="delete-book"]').click();
  await page.locator('[data-action="confirm-book"]').click();
  await expect(page.locator('.save-status')).toHaveText('已保存');
  const reading = await page.evaluate(() => new Promise<Record<string, unknown>>(resolve => {
    const req = indexedDB.open('local-editing-preview');
    req.onsuccess = () => {
      const db = req.result;
      const get = db.transaction('records').objectStore('records').get('reading');
      get.onsuccess = () => { db.close(); resolve(get.result ? JSON.parse(get.result.value) : {}); };
    };
  }));
  expect(reading['1']).toBeUndefined();
});

test('delete confirmation offers cancel', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  await page.getByRole('button', { name: '书籍菜单', exact: true }).click();
  await page.locator('[data-action="delete-book"]').click();
  await expect(page.locator('.sheet-content')).toContainText('删除后 5 秒内可以撤销');
  await expect(page.locator('.sheet-content [data-action="sheet-back"]')).toHaveText('取消');
  await page.locator('.sheet-content [data-action="sheet-back"]').click();
  await expect(page.locator('#sheet')).toHaveAttribute('aria-label', '书籍操作');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '返回书架', exact: true }).click();
  await expect(page.locator('[data-action="book:1"]')).toBeVisible();
});

test('whole-book undo skips chapters edited afterwards', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  await page.getByRole('button', { name: '书籍菜单', exact: true }).click();
  await page.locator('[data-action="format-book"]').click();
  await page.locator('[data-action="chapter:0"]').click();
  const body = page.getByRole('textbox', { name: '章节正文', exact: true });
  await body.fill('后来改过的正文');
  await page.getByRole('button', { name: '返回目录', exact: true }).click();
  await page.getByRole('button', { name: '书籍菜单', exact: true }).click();
  await page.locator('[data-action="undo-book-change"]').click();
  await expect(page.locator('#notice')).toContainText('1 章之后改过，没有撤销');
  await page.locator('[data-action="chapter:0"]').click();
  await expect(body).toHaveText('后来改过的正文');
});

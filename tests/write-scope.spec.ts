import { test, expect } from './seed';

async function writtenIds(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __writtenIds?: string[] }).__writtenIds ?? []);
}

test('新建书籍只写书行和 book-order', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.save-status')).toHaveText('已保存');   // 此时迁移已经完成
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as unknown as { __writtenIds?: string[] }).__writtenIds = [];
    IDBObjectStore.prototype.put = function (value: { id: string }) {
      (window as unknown as { __writtenIds?: string[] }).__writtenIds!.push(value.id);
      return original.call(this, value);
    };
  });
  await page.locator('[data-action="new-book"]').click();
  await page.locator('#book-name').fill('只写一行的书');
  await page.locator('#book-form button[type="submit"]').click();
  await expect(page.locator('.save-status')).toHaveText('已保存');
  const ids = await writtenIds(page);
  expect(ids.some(id => id === 'book-order')).toBe(true);
  const newBooks = ids.filter(id => id.startsWith('book:'));
  expect(newBooks).toHaveLength(1);
  expect(Number(newBooks[0].slice(5))).toBeGreaterThan(1);
  expect(ids.filter(id => id.startsWith('chapter:'))).toEqual([]);
  expect(ids).not.toContain('book:1');
  expect(ids).not.toContain('book:2');
  expect(ids).not.toContain('book:3');
});

test('切换标签页只写 session 行', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.save-status')).toHaveText('已保存');
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as unknown as { __writtenIds?: string[] }).__writtenIds = [];
    IDBObjectStore.prototype.put = function (value: { id: string }) {
      (window as unknown as { __writtenIds?: string[] }).__writtenIds!.push(value.id);
      return original.call(this, value);
    };
  });
  for (let round = 0; round < 3; round++) {
    await page.locator('[data-action="tab:read"]').click();
    await page.locator('[data-action="tab:edit"]').click();
  }
  await page.waitForTimeout(2500);
  const ids = await page.evaluate(() => (window as unknown as { __writtenIds?: string[] }).__writtenIds ?? []);
  expect([...new Set(ids)]).toEqual(['session']);
});

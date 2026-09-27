import { test, expect } from './seed';
import { toShelf } from './seed';
import type { Page } from '@playwright/test';

async function openChapter(page: Page) {
  await page.locator('[data-action="book:1"]').click();
  await page.locator('[data-action="chapter:0"]').click();
}
async function saved(page: Page) {
  await expect(page.locator('.save-status')).toHaveText('已保存');
}

test('chapter text, title and added chapter survive reload', async ({ page }) => {
  await page.goto('/');
  await openChapter(page);
  await page.getByRole('textbox', { name: '章节标题', exact: true }).fill('持久化标题');
  await page.getByRole('textbox', { name: '章节正文', exact: true }).fill('第一行\n\n中文、空格 and punctuation。');
  await saved(page);
  await page.reload();
  await toShelf(page);
  await openChapter(page);
  await expect(page.getByRole('textbox', { name: '章节标题', exact: true })).toHaveText('持久化标题');
  await expect(page.getByRole('textbox', { name: '章节正文', exact: true })).toContainText('中文、空格 and punctuation。');
  await page.getByRole('button', { name: '返回目录', exact: true }).click();
  await page.getByRole('button', { name: '新建章节', exact: true }).last().click();
  await saved(page);
  await page.reload();
  await toShelf(page);
  await page.locator('[data-action="book:1"]').click();
  await expect(page.locator('[data-action^="chapter:"]')).toHaveCount(4);
});

test('failed save leaves text intact and retry persists it', async ({ page }) => {
  await page.goto('/');
  await openChapter(page);
  await saved(page);
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof original>) {
      if (args[1] === 'readwrite') {
        IDBDatabase.prototype.transaction = original;
        throw new DOMException('Test disk full', 'QuotaExceededError');
      }
      return original.apply(this, args);
    };
  });
  const body = page.getByRole('textbox', { name: '章节正文', exact: true });
  await body.fill('保存失败后保留的正文');
  await expect(page.locator('.save-status')).toHaveText('保存失败 · 点击重试');
  await expect(body).toHaveText('保存失败后保留的正文');
  await page.locator('.save-status').click();
  await saved(page);
  await page.reload();
  await toShelf(page);
  await openChapter(page);
  await expect(body).toHaveText('保存失败后保留的正文');
});

test('composition input is not rerendered by autosave', async ({ page }) => {
  await page.goto('/');
  await openChapter(page);
  const body = page.getByRole('textbox', { name: '章节正文', exact: true });
  await body.fill('中文组合输入');
  await body.dispatchEvent('compositionstart');
  const handle = await body.elementHandle();
  await saved(page);
  expect(await handle!.evaluate(node => node.isConnected)).toBe(true);
  await body.dispatchEvent('compositionend');
  await expect(body).toHaveText('中文组合输入');
});

test('chapter selection survives reorder and deletion stays deleted', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  await page.getByRole('button', { name: '管理章节', exact: true }).click();
  await page.locator('[data-action="select-chapter:0"]').click();
  await page.locator('[data-chapter-handle="0"]').press('ArrowDown');
  await expect(page.locator('[data-action="select-chapter:1"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-action="delete-chapters"]').click();
  await page.locator('[data-action="confirm-chapters"]').click();
  await saved(page);
  await page.reload();
  await toShelf(page);
  await page.locator('[data-action="book:1"]').click();
  await expect(page.locator('[data-action^="chapter:"]')).toHaveCount(2);
  await expect(page.locator('[data-action="chapter:0"]')).toContainText('旧书店');
});

test('continuous typing persists during input and latest edit survives navigation', async ({ page }) => {
  await page.goto('/');
  await openChapter(page);
  const body = page.getByRole('textbox', { name: '章节正文', exact: true });
  await body.fill('');
  await body.pressSequentially('abcdefghij', { delay: 250 });
  await page.getByRole('button', { name: '返回目录', exact: true }).click();
  await saved(page);
  await page.reload();
  await toShelf(page);
  await openChapter(page);
  await expect(body).toHaveText('abcdefghij');
});

test('new folder and shared library display preference survive reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '书架菜单', exact: true }).click();
  await page.locator('[data-action="new-group"]').click();
  await page.locator('#simple-value').fill('持久化分组');
  await page.locator('#simple-form button').click();
  await page.getByRole('button', { name: '书架菜单', exact: true }).click();
  await page.locator('[data-action="view:list"]').click();
  await saved(page);
  await page.reload();
  await toShelf(page);
  await expect(page.locator('.books')).toHaveClass(/list/);
  await expect(page.locator('.folder-open').filter({ hasText: '持久化分组' })).toBeVisible();
});

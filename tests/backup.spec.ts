import { test, expect } from './seed';
import { toShelf } from './seed';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { decodeBackup, encodeBackup } from '../app/features/backup/model';

async function menu(page: Page, action: string) {
  await page.getByRole('button', { name: '书架菜单', exact: true }).click();
  await page.locator('[data-action="' + action + '"]').click();
}
async function exportBackup(page: Page) {
  await menu(page, 'backup');
  const pending = page.waitForEvent('download');
  await page.locator('#export-backup').click();
  const download = await pending;
  return readFile((await download.path())!, 'utf8');
}
async function deleteBook(page: Page) {
  await page.locator('[data-action="book:1"]').click();
  await page.getByRole('button', { name: '书籍菜单', exact: true }).click();
  await page.locator('[data-action="delete-book"]').click();
  await page.locator('[data-action="confirm-book"]').click();
  await expect(page.locator('.save-status')).toHaveText('已保存');
}
async function selectBackup(page: Page, text: string) {
  await page.locator('#backup-file').setInputFiles({ name: '完整备份.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.locator('#confirm-backup-restore')).toBeVisible();
  await expect(page.locator('#confirm-backup-restore')).toBeDisabled();
  await page.locator('#backup-confirm-check').check();
}

test('backup restore is complete and can roll back to previous library', async ({ page }) => {
  await page.goto('/');
  const text = await exportBackup(page);
  const decoded = await decodeBackup(text);
  expect(decoded.data.books).toHaveLength(3);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await deleteBook(page);
  await menu(page, 'backup');
  await selectBackup(page, text);
  await page.locator('#confirm-backup-restore').click();
  await expect(page.locator('[data-action="book:1"]')).toBeVisible();
  await menu(page, 'backup');
  await page.locator('#restore-previous').click();
  await page.locator('#confirm-previous').click();
  await expect(page.locator('.books')).toBeVisible();
  await expect(page.locator('[data-action="book:1"]')).toHaveCount(0);
});

test('corrupt backup and failed restore never overwrite existing library', async ({ page }) => {
  await page.goto('/');
  const text = await exportBackup(page);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await deleteBook(page);
  await menu(page, 'backup');
  const corrupt = JSON.parse(text);
  corrupt.payload += ' ';
  await page.locator('#backup-file').setInputFiles({ name: '损坏.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(corrupt)) });
  await expect(page.locator('#backup-error')).toContainText('内容校验失败');
  await expect(page.locator('#confirm-backup-restore')).toHaveCount(0);
  await selectBackup(page, text);
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof original>) {
      if (args[1] === 'readwrite') {
        IDBDatabase.prototype.transaction = original;
        const transaction = original.apply(this, args);
        queueMicrotask(() => transaction.abort());
        return transaction;
      }
      return original.apply(this, args);
    };
  });
  await page.locator('#confirm-backup-restore').click();
  await expect(page.locator('#backup-error')).not.toBeEmpty();
  await page.reload();
  await toShelf(page);
  await expect(page.locator('[data-action="book:1"]')).toHaveCount(0);
});

test('backup includes cover, settings and positions without recovery or restore point', async ({ page }) => {
  await page.goto('/');
  const text = await exportBackup(page);
  const data = (await decodeBackup(text)).data;
  data.books[0].image = 'data:image/png;base64,aGVsbG8=';
  data.prefs.font = 24;
  data.reading['1'] = { chapter: 1, chapterId: data.books[0].chapters[1].id, scroll: 50 };
  expect(data).not.toHaveProperty('recovery');
  expect(data).not.toHaveProperty('restorePoint');
  const restored = (await decodeBackup(await encodeBackup(data))).data;
  expect(restored).toEqual(data);
});

test('backup restores embedded covers, preferences and reading position through database', async ({ page }) => {
  await page.goto('/');
  const original = await exportBackup(page);
  const data = (await decodeBackup(original)).data;
  data.books[0].name = '封面恢复检查';
  data.books[0].image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
  data.view = 'list';
  data.prefs.font = 24;
  data.reading['1'] = { chapter: 1, chapterId: data.books[0].chapters[1].id, scroll: 0 };
  await selectBackup(page, await encodeBackup(data));
  await page.locator('#confirm-backup-restore').click();
  await expect(page.locator('.books')).toHaveClass(/list/);
  await expect(page.locator('[data-action="book:1"] img')).toHaveAttribute('src', data.books[0].image);
  const restored = (await decodeBackup(await exportBackup(page))).data;
  expect(restored.books).toEqual(data.books);
  expect(restored.prefs).toEqual(data.prefs);
  expect(restored.reading).toEqual(data.reading);
  expect(restored).not.toHaveProperty('restorePoint');
  await expect(page.locator('#restore-previous')).toBeVisible();
});

test('invalid references and future versions rejected', async ({ page }) => {
  await page.goto('/');
  const original = await exportBackup(page);
  const data = (await decodeBackup(original)).data;
  data.books[0].group = 9999;
  await expect(encodeBackup(data)).rejects.toThrow('分组引用');
  const future = JSON.parse(original);
  future.version = 999;
  await expect(decodeBackup(JSON.stringify(future))).rejects.toThrow('不是支持');
});

test('version 1 backups with recovery records still import', async ({ page }) => {
  await page.goto('/');
  const original = await exportBackup(page);
  const data = (await decodeBackup(original)).data;
  (data as Record<string, unknown>).recovery = [{ id: 'r1', label: '旧记录', date: new Date(0).toISOString(), before: [], after: [], reading: {}, editing: {} }];
  const payload = JSON.stringify(data);
  const version1 = JSON.stringify({ format: 'local-editing-backup', version: 1, created: new Date().toISOString(), sha256: createHash('sha256').update(payload).digest('hex'), payload });
  const restored = (await decodeBackup(version1)).data;
  expect(restored).not.toHaveProperty('recovery');
  expect(restored.books).toEqual(data.books);
});

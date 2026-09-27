import { test, expect } from './seed';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decodeBackup, encodeBackup, canRestore, restoreEntry, checkpoint, type Library } from '../app/features/recovery/model';

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

test('deleted book restores after reload including chapters', async ({ page }) => {
  await page.goto('/');
  await deleteBook(page);
  await page.reload();
  await expect(page.locator('[data-action="book:1"]')).toHaveCount(0);
  await menu(page, 'recovery');
  await page.locator('[data-recovery-id]').first().click();
  await page.locator('#restore-original').click();
  await expect(page.locator('[data-action="book:1"]')).toBeVisible();
  await page.locator('[data-action="book:1"]').click();
  await expect(page.locator('[data-action^="chapter:"]')).toHaveCount(3);
});

test('format recovery survives reload and later changes force a copy', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  await page.locator('[data-action="chapter:0"]').click();
  const body = page.getByRole('textbox', { name: '章节正文', exact: true });
  await body.fill('原来的正文');
  await page.locator('[data-action="tool:format"]').click();
  await expect(page.locator('.save-status')).toHaveText('已保存');
  await body.fill('后来修改的正文');
  await expect(page.locator('.save-status')).toHaveText('已保存');
  await page.reload();
  await menu(page, 'recovery');
  await page.locator('[data-recovery-id]').first().click();
  await expect(page.locator('#restore-original')).toBeDisabled();
  await page.locator('#restore-copy').click();
  const copy = page.locator('.book').filter({ hasText: '恢复副本' });
  await expect(copy).toHaveCount(1);
  await copy.click();
  await page.locator('[data-action="chapter:0"]').click();
  await expect(body).toHaveText('原来的正文');
});

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
  await menu(page, 'recovery');
  await expect(page.locator('[data-recovery-id]')).toHaveCount(1);
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
  await expect(page.locator('#recovery-error')).toContainText('内容校验失败');
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
  await expect(page.locator('#recovery-error')).not.toBeEmpty();
  await page.reload();
  await expect(page.locator('[data-action="book:1"]')).toHaveCount(0);
  await menu(page, 'recovery');
  await expect(page.locator('[data-recovery-id]')).toHaveCount(1);
});

test('backup includes cover, settings, positions and recovery without recursive restore points', async ({ page }) => {
  await page.goto('/');
  const text = await exportBackup(page);
  const data = (await decodeBackup(text)).data;
  data.books[0].image = 'data:image/png;base64,aGVsbG8=';
  data.prefs.font = 24;
  data.reading['1'] = { chapter: 1, chapterId: data.books[0].chapters[1].id, scroll: 50 };
  checkpoint(data, '记录', [data.books[0]], []);
  const restored = (await decodeBackup(await encodeBackup(data))).data;
  expect(restored).toEqual(data);
  const deleted = { ...data, books: data.books.slice(1) } as Library;
  expect(canRestore(deleted, data.recovery[0])).toBe(true);
  const recovered = restoreEntry(deleted, data.recovery[0], false);
  expect(recovered.books.find(book => book.id === 1)?.image).toBe(data.books[0].image);
});

test('deleted chapters restore without losing order and record removal needs confirmation', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  await page.getByRole('button', { name: '管理章节', exact: true }).click();
  await page.locator('[data-action="select-chapter:1"]').click();
  await page.locator('[data-action="delete-chapters"]').click();
  await page.locator('[data-action="confirm-chapters"]').click();
  await expect(page.locator('.save-status')).toHaveText('已保存');
  await page.reload();
  await menu(page, 'recovery');
  await page.locator('[data-recovery-id]').click();
  await expect(page.locator('#restore-original')).toBeEnabled();
  await page.locator('#restore-original').click();
  await page.locator('[data-action="book:1"]').click();
  await expect(page.locator('[data-action="chapter:1"]')).toContainText('旧书店');
  await page.getByRole('button', { name: '返回书架', exact: true }).click();
  await menu(page, 'recovery');
  await page.locator('[data-recovery-id]').click();
  await page.locator('#remove-record').click();
  await expect(page.locator('#confirm-remove-record')).toBeVisible();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await menu(page, 'recovery');
  await expect(page.locator('[data-recovery-id]')).toHaveCount(1);
  await page.locator('[data-recovery-id]').click();
  await page.locator('#remove-record').click();
  await page.locator('#confirm-remove-record').click();
  await expect(page.locator('.books')).toBeVisible();
  await menu(page, 'recovery');
  await expect(page.locator('[data-recovery-id]')).toHaveCount(0);
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
  expect(restored.restorePoint.books[0].name).toBe('雨停之后');
});

test('invalid references and future versions rejected, recovery limit never discards older entries', async ({ page }) => {
  await page.goto('/');
  const original = await exportBackup(page);
  const data = (await decodeBackup(original)).data;
  const book = data.books[0];
  for (let i = 0; i < 50; i++) checkpoint(data, '记录' + i, [book], []);
  expect(() => checkpoint(data, '超出', [book], [])).toThrow('上限');
  expect(data.recovery).toHaveLength(50);
  expect(data.recovery[0].label).toBe('记录0');
  data.books[0].group = 9999;
  await expect(encodeBackup(data)).rejects.toThrow('分组引用');
  const future = JSON.parse(original);
  future.version = 999;
  await expect(decodeBackup(JSON.stringify(future))).rejects.toThrow('不是支持');
});

test('deleted group restores membership after reload', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="group-menu:1"]').click();
  await page.locator('[data-action="delete-group"]').click();
  await page.locator('[data-action="confirm-group"]').click();
  await expect(page.locator('.save-status')).toHaveText('已保存');
  await page.reload();
  await expect(page.locator('.folder-open')).toHaveCount(0);
  await menu(page, 'recovery');
  await page.locator('[data-recovery-id]').click();
  await page.locator('#restore-original').click();
  await expect(page.locator('.folder-open')).toContainText('待整理');
  await page.locator('.folder-open').click();
  await expect(page.locator('[data-action="book:3"]')).toBeVisible();
});

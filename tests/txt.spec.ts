import { test, expect } from './seed';
import { toShelf } from './seed';
import { readFile } from 'node:fs/promises';
import { decodeText, parseText, exportText, txtFilename } from '../app/features/txt/text';

const original = '《测试小说》\r\n作者：小林\r\n\r\n这段前文不能丢。\r\n\r\n第一章 归来\r\n　　第一段。\r\n\r\n  第二段 空格。\r\n第二章 空章\r\n第三章 尾声\r\n最后一句，没有换行';

test('spaced and fullwidth chapter headings are separated from bodies without changing source', () => {
  for (const newline of ['\n', '\r\n', '\r']) {
    const titles = ['第 1 章', '第 2 章', '第　３　章', '第\t四\t章 归来', '第5章', 'Chapter 6'];
    const source = titles.map((title, index) => title + newline + '正文' + index + newline).join('');
    const parsed = parseText(source, '空格章节.txt', 'auto');
    expect(parsed.chapters.map(chapter => chapter.name)).toEqual(titles);
    expect(parsed.chapters.map(chapter => chapter.body)).toEqual(titles.map((_, index) => '正文' + index + newline));
    expect(exportText(parsed, { titles: true, metadata: false, spacing: 'original' })).toBe(source);
  }
});

test('imported spaced headings appear only in chapter title, including after reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '书架菜单', exact: true }).click();
  await page.locator('[data-action="import"]').click();
  await page.locator('#txt-file').setInputFiles({ name: '空格章节.txt', mimeType: 'text/plain', buffer: Buffer.from('第 1 章\n这是第一段正文。\n第 2 章\n这是第二段正文。') });
  await expect(page.locator('#txt-confirm')).toBeEnabled();
  await expect(page.locator('#txt-chapter option')).toHaveCount(2);
  await expect(page.locator('#txt-preview')).toHaveText('这是第一段正文。');
  await page.locator('#txt-confirm').click();
  await expect(page.locator('.chapter-page')).toBeVisible();
  await page.reload();
  await toShelf(page);
  await page.locator('.book').filter({ hasText: '空格章节' }).click();
  await page.locator('[data-action="chapter:0"]').click();
  await expect(page.getByRole('textbox', { name: '章节标题', exact: true })).toHaveText('第 1 章');
  await expect(page.getByRole('textbox', { name: '章节正文', exact: true })).toHaveText('这是第一段正文。');
});

test('TXT round trip preserves headings, preface, CRLF, spaces and empty chapters', () => {
  const parsed = parseText(original, '测试.txt', 'auto');
  expect(parsed.name).toBe('测试小说');
  expect(parsed.author).toBe('小林');
  expect(parsed.chapters).toHaveLength(4);
  expect(parsed.chapters[2].body).toBe('');
  expect(exportText(parsed, { titles: true, metadata: false, spacing: 'original' })).toBe(original);
  expect(parseText(original, '测试.txt', 'single').chapters[0].body).toBe(original);
});

test('decodes GBK and BOM UTF16 and refuses invalid UTF8', () => {
  expect(decodeText(new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]), 'auto')).toEqual({ text: '中文', encoding: 'gb18030' });
  expect(decodeText(new Uint8Array([0xff, 0xfe, 0x2d, 0x4e, 0x87, 0x65]), 'auto').text).toBe('中文');
  expect(() => decodeText(new Uint8Array([0xff]), 'utf-8')).toThrow();
  expect(txtFilename('新书.txt')).toBe('新书.txt');
  expect(() => txtFilename('../新书')).toThrow();
  expect(() => parseText('', '空.txt', 'auto')).toThrow();
});

test('edited or reordered chapters retain a boundary in exported text', () => {
  const parsed = parseText('第一章\n正文\n第二章', '书.txt', 'auto');
  parsed.chapters[1].body = '新增正文';
  parsed.chapters.reverse();
  expect(exportText(parsed, { titles: true, metadata: false, spacing: 'original' })).toBe('第二章\n新增正文\n\n第一章\n正文\n');
});

test('five MB text stays in a single chapter without truncation', () => {
  const text = '中文正文\n'.repeat(403299);
  expect(Buffer.byteLength(text)).toBeGreaterThan(5_000_000);
  const parsed = parseText(text, '长文.txt', 'auto');
  expect(parsed.chapters).toHaveLength(1);
  expect(exportText(parsed, { titles: true, metadata: false, spacing: 'original' })).toBe(text);
});

test('import confirms persisted book, reloads and exports unchanged bytes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '书架菜单', exact: true }).click();
  await page.locator('[data-action="import"]').click();
  await page.locator('#txt-file').setInputFiles({ name: '测试小说.txt', mimeType: 'text/plain', buffer: Buffer.from(original) });
  await expect(page.locator('#txt-confirm')).toBeEnabled();
  await expect(page.locator('#txt-title')).toHaveValue('测试小说');
  await expect(page.locator('#txt-chapter option')).toHaveCount(4);
  await page.screenshot({ path: 'test-results/txt-import.png' });
  await page.locator('#txt-confirm').click();
  await expect(page.locator('.chapter-page')).toBeVisible();
  await expect(page.locator('.save-status')).toHaveText('已保存');
  await page.reload();
  await toShelf(page);
  await page.locator('.book').filter({ hasText: '测试小说' }).click();
  await page.getByRole('button', { name: '书籍菜单', exact: true }).click();
  await page.locator('[data-action="export-book"]').click();
  await page.locator('#export-name').fill('往返导出.txt');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#txt-export-form .primary').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('往返导出.txt');
  expect(await readFile((await download.path())!, 'utf8')).toBe(original);
});

test('import fails atomically and can retry without creating duplicates', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '书架菜单', exact: true }).click();
  await page.locator('[data-action="import"]').click();
  await page.locator('#txt-file').setInputFiles({ name: '重试测试.txt', mimeType: 'text/plain', buffer: Buffer.from('待保存的完整正文') });
  await expect(page.locator('#txt-confirm')).toBeEnabled();
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof original>) {
      if (args[1] === 'readwrite') {
        IDBDatabase.prototype.transaction = original;
        throw new DOMException('Test quota failure', 'QuotaExceededError');
      }
      return original.apply(this, args);
    };
  });
  await page.locator('#txt-confirm').click();
  await expect(page.locator('#txt-error')).toContainText('导入未保存');
  await page.locator('#txt-confirm').click();
  await expect(page.locator('.chapter-page')).toBeVisible();
  await page.reload();
  await toShelf(page);
  await expect(page.locator('.book').filter({ hasText: '重试测试' })).toHaveCount(1);
});

test('five MB import persists and exports complete text after reload', async ({ page }) => {
  const text = '中文正文\n'.repeat(403299);
  await page.goto('/');
  await page.getByRole('button', { name: '书架菜单', exact: true }).click();
  await page.locator('[data-action="import"]').click();
  await page.locator('#txt-file').setInputFiles({ name: '五兆整章.txt', mimeType: 'text/plain', buffer: Buffer.from(text) });
  await expect(page.locator('#txt-confirm')).toBeEnabled();
  await expect(page.locator('#txt-chapter option')).toHaveCount(1);
  await page.locator('#txt-confirm').click();
  await expect(page.locator('.chapter-page')).toBeVisible();
  await page.reload();
  await toShelf(page);
  await page.locator('.book').filter({ hasText: '五兆整章' }).click();
  await page.getByRole('button', { name: '书籍菜单', exact: true }).click();
  await page.locator('[data-action="export-book"]').click();
  const pending = page.waitForEvent('download');
  await page.locator('#txt-export-form .primary').click();
  expect(await readFile((await (await pending).path())!, 'utf8')).toBe(text);
});

test('duplicate file requires explicit choice and import can open reading directly', async ({ page }) => {
  await page.goto('/');
  const selectFile = async () => {
    await page.getByRole('button', { name: '书架菜单', exact: true }).click();
    await page.locator('[data-action="import"]').click();
    await page.locator('#txt-file').setInputFiles({ name: '重复检测.txt', mimeType: 'text/plain', buffer: Buffer.from('第一章 阅读\n独立正文') });
    await expect(page.locator('#txt-confirm')).toBeEnabled();
  };
  await selectFile();
  await page.locator('#txt-destination').selectOption('reader');
  await page.locator('#txt-confirm').click();
  await expect(page.locator('.reader')).toBeVisible();
  await expect(page.locator('.manuscript')).not.toHaveAttribute('contenteditable');
  await page.reload();
  await toShelf(page);
  await selectFile();
  await page.locator('#txt-confirm').click();
  await expect(page.locator('#txt-error')).toContainText('此文件已经导入');
  await page.locator('#txt-duplicate').check();
  await page.locator('#txt-confirm').click();
  await expect(page.locator('.chapter-page')).toBeVisible();
  await page.reload();
  await toShelf(page);
  await expect(page.locator('.book').filter({ hasText: '重复检测' })).toHaveCount(2);
});

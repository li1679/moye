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

const recognitionCases: { name: string; source: string; chapters: string[]; bodies?: string[] }[] = [
  { name: 'does not split a lesson sentence', source: '第一节课下课后，他走出教室。', chapters: ['正文'] },
  { name: 'does not split a round sentence', source: '第三回合他赢了', chapters: ['正文'] },
  { name: 'recognizes a separated traditional chapter title', source: '第三回 宴桃园豪杰三结义\n正文', chapters: ['第三回 宴桃园豪杰三结义'] },
  { name: 'merges an adjacent volume and chapter heading', source: '第一卷 风起\n\n第一章 开端\n正文', chapters: ['第一卷 风起 第一章 开端'] },
  { name: 'keeps a volume with body as its own chapter', source: '第一卷 风起\n卷首语\n第一章 开端\n正文', chapters: ['第一卷 风起', '第一章 开端'], bodies: ['卷首语\n', '正文'] },
  { name: 'recognizes bracketed and body-prefixed headings', source: '【第一章】开端\n甲\n正文 第一章 继续\n乙', chapters: ['【第一章】开端', '正文 第一章 继续'] },
  { name: 'recognizes a consecutive numeric heading sequence', source: Array.from({ length: 6 }, (_, index) => `${index + 1}\n正文${index + 1}\n`).join(''), chapters: ['1', '2', '3', '4', '5', '6'] },
  { name: 'ignores a short numbered list', source: '1. 买菜\n2. 做饭\n正文', chapters: ['正文'] },
  { name: 'accepts punctuation after a separated chapter title', source: '第十章 夜，深了\n正文', chapters: ['第十章 夜，深了'] },
];

for (const item of recognitionCases) test(item.name, () => {
  const parsed = parseText(item.source, '识别.txt', 'auto');
  expect(parsed.chapters.map(chapter => chapter.name)).toEqual(item.chapters);
  if (item.bodies) expect(parsed.chapters.map(chapter => chapter.body)).toEqual(item.bodies);
  expect(parsed.chapters.map(chapter => (chapter.sourceHeading?.raw ?? '') + chapter.body).join('')).toBe(item.source);
  expect(exportText(parsed, { titles: true, metadata: false, spacing: 'original' })).toBe(item.source);
});

test('warns when automatic recognition creates too many short chapters', () => {
  const source = Array.from({ length: 10 }, (_, index) => `第${index + 1}章\n短文${index + 1}\n`).join('');
  expect(parseText(source, '短章.txt', 'auto').warning).toContain('10 章不足 50 字');
});

test('import preview shows the short-chapter warning below the summary', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="home-menu"]').click();
  await page.locator('[data-action="import"]').click();
  const source = Array.from({ length: 10 }, (_, index) => `第${index + 1}章\n短文${index + 1}\n`).join('');
  await page.locator('#txt-file').setInputFiles({ name: '短章.txt', mimeType: 'text/plain', buffer: Buffer.from(source) });
  await expect(page.locator('#txt-warning.error')).toContainText('10 章不足 50 字');
  await expect(page.locator('#txt-summary + #txt-warning')).toBeVisible();
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

test('importing chapters appends to the current book without creating another book', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  await page.getByRole('button', { name: '书籍菜单', exact: true }).click();
  await page.getByRole('button', { name: '导入章节', exact: true }).click();
  await expect(page.locator('#sheet .sheet-head h2')).toHaveText('导入章节到本书');
  await expect(page.locator('#txt-title, #txt-author, #txt-duplicate, #txt-destination')).toHaveCount(0);
  await page.locator('#txt-file').setInputFiles({ name: '追加章节.txt', mimeType: 'text/plain', buffer: Buffer.from('第4章\n新增正文四。\n第5章\n新增正文五。') });
  await expect(page.locator('#txt-confirm')).toBeEnabled();
  await expect(page.locator('#txt-confirm')).toHaveText('追加到本书末尾');
  await page.locator('#txt-confirm').click();
  await expect(page.locator('.chapter-row')).toHaveCount(5);
  await page.getByRole('button', { name: '返回书架', exact: true }).click();
  await expect(page.locator('.book')).toHaveCount(2);
  await page.reload();
  await toShelf(page);
  await page.locator('[data-action="book:1"]').click();
  await expect(page.locator('.chapter-row')).toHaveCount(5);
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

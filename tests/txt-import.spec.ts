import { test, expect, toShelf } from './seed';
import { selectTxt } from './txt-helper';
import { parseText, exportText } from '../app/features/txt/text';

for (const newline of ['\n', '\r\n', '\r']) {
  test(`空作者不跨行识别第一章 (${JSON.stringify(newline)})`, () => {
    const source = ['书名：测试小说', '作者：　', '', '第1章 开始', '这是第一章正文。', '第2章 继续', '这是第二章正文。'].join(newline);
    const parsed = parseText(source, '文件名.txt', 'auto');
    expect(parsed.name).toBe('测试小说');
    expect(parsed.author).toBe('');
    expect(parsed.chapters.map(chapter => chapter.name)).toEqual(['第1章 开始', '第2章 继续']);
    expect(parsed.chapters[0].body).toBe('这是第一章正文。' + newline);
    expect(exportText(parsed, { titles: true, metadata: false, spacing: 'original' })).toBe(source);
  });
}

const headers = [
  { text: '《测试小说》\n作者：小林\n\n', author: '小林' },
  { text: '《测试小说》 作者：小林\n', author: '小林' },
  { text: '测试小说\n作者：\n', author: '' },
  { text: '书名：测试小说\n作者：\n\n', author: '' },
  { text: '\n　\n', author: '' },
];
for (const [index, header] of headers.entries()) test(`书名作者及空行不生成空前文 ${index}`, () => {
  const source = header.text + '第一章 开始\n正文';
  const parsed = parseText(source, '测试小说.txt', 'auto');
  expect(parsed.author).toBe(header.author);
  expect(parsed.chapters.map(chapter => chapter.name)).toEqual(['第一章 开始']);
  expect(parsed.chapters[0].body).toBe('正文');
  expect(exportText(parsed, { titles: true, metadata: false, spacing: 'original' })).toBe(source);
});

test('真正的前文保留正文，但不含书名作者，导出仍保留原文', () => {
  const source = '《测试小说》\r\n作者：小林\r\n\r\n　　真正的前言。\r\n\r\n第一章\r\n正文';
  const parsed = parseText(source, '测试.txt', 'auto');
  expect(parsed.chapters.map(chapter => chapter.name)).toEqual(['前文', '第一章']);
  expect(parsed.chapters[0].body).toBe('　　真正的前言。\r\n\r\n');
  expect(exportText(parsed, { titles: true, metadata: false, spacing: 'original' })).toBe(source);
});

test('无章节标题时也只把正文作为正文，整篇模式仍保持全文', () => {
  const source = '书名：测试小说\n作者：小林\n\n这是正文。';
  const parsed = parseText(source, '测试.txt', 'auto');
  expect(parsed.chapters).toHaveLength(1);
  expect(parsed.chapters[0].body).toBe('这是正文。');
  expect(exportText(parsed, { titles: true, metadata: false, spacing: 'original' })).toBe(source);
  expect(parseText(source, '测试.txt', 'single').chapters[0].body).toBe(source);
});

test('不把正文中的作者、书名标记当成书籍信息', () => {
  const source = '第一章\n作者：这是小说里的台词。\n书名：这也是正文。';
  const parsed = parseText(source, '测试.txt', 'auto');
  expect(parsed.name).toBe('测试');
  expect(parsed.author).toBe('');
  expect(parsed.chapters[0].body).toBe('作者：这是小说里的台词。\n书名：这也是正文。');
});

test('取消选文件不打开导入面板，也不创建书籍', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="home-menu"]').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-action="import"]').click();
  await (await chooser).setFiles([]);
  await expect(page.locator('#txt-import-form')).toHaveCount(0);
  await expect(page.locator('.book')).toHaveCount(2);
});

test('精简导入面板，空作者与元数据不进入章节，导入后留在首页', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="home-menu"]').click();
  await selectTxt(page, '空作者小说.txt', '书名：空作者小说\n作者：\n\n第1章 开始\n真正的正文');
  await expect(page.locator('#txt-confirm')).toBeEnabled();
  await expect(page.locator('#txt-encoding, #txt-mode, #txt-author, #txt-chapter, #txt-preview, #txt-destination')).toHaveCount(0);
  await expect(page.locator('#txt-title')).toHaveValue('空作者小说');
  await expect(page.locator('#txt-summary')).toContainText('1 章');
  await page.locator('#txt-confirm').click();
  await expect(page.locator('.books')).toBeVisible();
  await expect(page.locator('.chapter-page, .reader')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.books')).toBeVisible();
  await toShelf(page);
  await page.locator('.book').filter({ hasText: '空作者小说' }).click();
  await expect(page.locator('.chapter-row')).toHaveCount(1);
  await page.locator('[data-action="chapter:0"]').click();
  await expect(page.getByRole('textbox', { name: '章节标题', exact: true })).toHaveText('第1章 开始');
  await expect(page.getByRole('textbox', { name: '章节正文', exact: true })).toHaveText('真正的正文');
});

test('解析失败后可以重新选择文件，取消重新选择保留已有结果', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="home-menu"]').click();
  await selectTxt(page, '空.txt', '');
  await expect(page.locator('#txt-error')).toContainText('空文件');
  await expect(page.locator('#txt-confirm')).toBeDisabled();
  const retry = page.waitForEvent('filechooser');
  await page.locator('#txt-reselect').click();
  await (await retry).setFiles({ name: '重选.txt', mimeType: 'text/plain', buffer: Buffer.from('第一章\n正文') });
  await expect(page.locator('#txt-confirm')).toBeEnabled();
  const cancel = page.waitForEvent('filechooser');
  await page.locator('#txt-reselect').click();
  await (await cancel).setFiles([]);
  await expect(page.locator('#txt-title')).toHaveValue('重选');
  await expect(page.locator('#txt-confirm')).toBeEnabled();
});

for (const filename of ['1.txt', '第一章.txt']) test(`与文件名相同的章节标题不能当作书名移除：${filename}`, () => {
  const source = filename === '1.txt'
    ? Array.from({ length: 6 }, (_, index) => `${index + 1}\n正文${index + 1}。\n`).join('')
    : '第一章\n正文一。\n第二章\n正文二。';
  const parsed = parseText(source, filename, 'auto');
  expect(parsed.chapters[0].name).toBe(filename.replace('.txt', ''));
  expect(parsed.chapters).toHaveLength(filename === '1.txt' ? 6 : 2);
  expect(exportText(parsed, { titles: true, metadata: false, spacing: 'original' })).toBe(source);
});

test('重命名首章后导出仍保留文件头，只更新章节标题', () => {
  const parsed = parseText('《测试小说》\r\n作者：小林\r\n\r\n第一章\r\n正文', '测试小说.txt', 'auto');
  parsed.chapters[0].name = '新章节标题';
  expect(exportText(parsed, { titles: true, metadata: false, spacing: 'original' })).toBe('《测试小说》\r\n作者：小林\r\n\r\n新章节标题\n正文');
});

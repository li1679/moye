import { test, expect } from './seed';
import type { Page } from '@playwright/test';
import { formatText, searchText, replaceText } from '../app/features/editor/text-tools';
import { ChapterHistory } from '../app/features/editor/history';

async function open(page: Page) {
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  await page.locator('[data-action="chapter:0"]').click();
}
const editor = (page: Page) => page.getByRole('textbox', { name: '章节正文', exact: true });

test('format is idempotent and preserves internal spaces and punctuation when disabled', () => {
  const input = '\r\n  hello world  \r\n\r\n\r\n　　中文......\r\n ';
  const options = { indent: true, spaces: true, punctuation: false, paragraph: 1 };
  const output = formatText(input, options);
  expect(output).toBe('　　hello world\r\n\r\n　　中文......');
  expect(formatText(output, options)).toBe(output);
  expect(formatText('......', { ...options, punctuation: true })).toBe('　　......');
  expect(formatText('  \n\n', options)).toBe('');
});

test('history isolates chapters and records literal patches and titles', () => {
  const history = new ChapterHistory();
  const a = { id: 'a', name: 'A', body: 'abc😀' };
  const b = { id: 'b', name: 'B', body: '其他章' };
  history.record(a, 'body', a.body, 'a新bc😀');
  a.body = 'a新bc😀';
  history.record(b, 'body', b.body, '其他章二');
  b.body = '其他章二';
  history.apply(a, 'undo');
  expect(a.body).toBe('abc😀');
  expect(b.body).toBe('其他章二');
  history.apply(a, 'redo');
  expect(a.body).toBe('a新bc😀');
  history.record(a, 'name', a.name, '新标题');
  a.name = '新标题';
  history.apply(a, 'undo');
  expect(a.name).toBe('A');
  history.record(a, 'body', a.body, '新操作');
  a.body = '新操作';
  expect(history.apply(a, 'redo')).toBeNull();
});

test('search counts all literal matches and pages without changing offsets', () => {
  const documents = [{ bookId: 1, chapterId: 'x', title: '章', bookName: '书', body: '😀<&>'.repeat(101) }];
  const first = searchText(documents, '<&>');
  const second = searchText(documents, '<&>', 1);
  expect(first.total).toBe(101);
  expect(first.hits).toHaveLength(50);
  expect(first.hits[0].offset).toBe(2);
  expect(second.hits[0].offset).toBe(252);
  expect(replaceText('aa aa', 'aa', '$&', 3)).toBe('aa $&');
  expect(replaceText('aa aa', 'aa', '')).toBe(' ');
});

test('format applies immediately as one undo operation and is idempotent', async ({ page }) => {
  await open(page);
  const original = '  第一段  \n\n第二段';
  await editor(page).fill(original);
  await page.locator('[data-action="tool:format"]').click();
  await expect(page.locator('#sheet')).not.toBeVisible();
  await expect(editor(page)).toContainText('　　第一段');
  await page.locator('[data-action="tool:undo"]').click();
  expect(await editor(page).innerText()).toBe(original);
  await page.locator('[data-action="tool:redo"]').click();
  const formatted = await editor(page).innerText();
  await page.locator('[data-action="tool:format"]').click();
  expect(await editor(page).innerText()).toBe(formatted);
  await expect(page.locator('#sheet')).not.toBeVisible();
});

test('undo survives chapter switching and new input invalidates redo', async ({ page }) => {
  await open(page);
  await editor(page).fill('第一次修改');
  await editor(page).fill('第二次修改');
  await page.getByRole('button', { name: '返回目录', exact: true }).click();
  await page.locator('[data-action="chapter:1"]').click();
  await editor(page).fill('另一章修改');
  await page.getByRole('button', { name: '返回目录', exact: true }).click();
  await page.locator('[data-action="chapter:0"]').click();
  await page.locator('[data-action="tool:undo"]').click();
  await expect(editor(page)).toHaveText('第一次修改');
  await editor(page).fill('第三次修改');
  await expect(page.locator('[data-action="tool:redo"]')).toBeDisabled();
  await expect(editor(page)).toHaveText('第三次修改');
  await expect(page.locator('.save-status')).toHaveText('已保存');
  await page.reload();
  await page.locator('[data-action="book:1"]').click();
  await page.locator('[data-action="chapter:0"]').click();
  await expect(editor(page)).toHaveText('第三次修改');
});

test('replace selected occurrence and undo all replacements in one step', async ({ page }) => {
  await open(page);
  await editor(page).fill('苹果，苹果，苹果');
  await page.locator('[data-action="tool:find"]').click();
  await page.locator('#query').fill('苹果');
  await page.locator('#replacement').fill('梨');
  await expect(page.locator('[data-action^="match-hit:"]')).toHaveCount(3);
  await page.locator('[data-action="match-hit:1"]').click();
  await page.locator('[data-action="replace-one"]').click();
  await expect(page.locator('[data-action^="match-hit:"]')).toHaveCount(2);
  await page.locator('[data-action="replace"]').click();
  await expect(page.locator('#search-results')).toContainText('没有找到匹配内容');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(editor(page)).toHaveText('梨，梨，梨');
  await page.locator('[data-action="tool:undo"]').click();
  await expect(editor(page)).toHaveText('苹果，梨，苹果');
  await page.locator('[data-action="tool:undo"]').click();
  await expect(editor(page)).toHaveText('苹果，苹果，苹果');
});

test('search navigates to second exact occurrence without changing text', async ({ page }) => {
  await open(page);
  const body = '开头目标\n' + '中间正文\n'.repeat(100) + '结尾目标';
  await editor(page).fill(body);
  await page.locator('[data-action="editor-menu"]').click();
  await page.locator('[data-action="chapter-search"]').click();
  await page.locator('#query').fill('目标');
  await expect(page.locator('[data-action^="match-hit:"]')).toHaveCount(2);
  await page.locator('[data-action="match-hit:1"]').click();
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('目标');
  expect(await editor(page).textContent()).toBe(body);
  expect(await page.locator('.editor-scroll').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/search-location.png' });
});

test('whole-book replacement previews and per-chapter undo restores text', async ({ page }) => {
  await open(page);
  await editor(page).fill('共同词 第一章');
  await page.getByRole('button', { name: '返回目录', exact: true }).click();
  await page.locator('[data-action="chapter:1"]').click();
  await editor(page).fill('共同词 第二章');
  await page.locator('[data-action="tool:find"]').click();
  await page.getByLabel('替换范围').selectOption('book');
  await page.locator('#query').fill('共同词');
  await page.locator('#replacement').fill('新词');
  await expect(page.locator('[data-action^="match-hit:"]')).toHaveCount(2);
  await page.locator('[data-action="replace"]').click();
  await expect(page.locator('.sheet-content')).toContainText('2 章、2 处匹配');
  await page.locator('[data-action="confirm-book-replace"]').click();
  await expect(editor(page)).toHaveText('新词 第二章');
  await page.getByRole('button', { name: '返回目录', exact: true }).click();
  await page.getByRole('button', { name: '书籍菜单', exact: true }).click();
  await expect(page.locator('[data-action="undo-book-format"]')).toHaveCount(0);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.locator('[data-action="chapter:0"]').click();
  await page.locator('[data-action="tool:undo"]').click();
  await expect(editor(page)).toHaveText('共同词 第一章');
});

test('composition is one undo operation and keyboard redo uses same history', async ({ page }) => {
  await open(page);
  await editor(page).fill('原文');
  await editor(page).dispatchEvent('compositionstart');
  await editor(page).fill('原文中');
  await editor(page).fill('原文中文');
  await editor(page).dispatchEvent('compositionend');
  await editor(page).press('Control+z');
  await expect(editor(page)).toHaveText('原文');
  await editor(page).press('Control+Shift+z');
  await expect(editor(page)).toHaveText('原文中文');
});

test('reader search locates text but never becomes editable', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="tab:read"]').click();
  await page.locator('[data-action="book:1"]').click();
  await page.locator('.editor-scroll').click({ position: { x: 200, y: 300 } });
  await page.locator('[data-action="chapter-search"]').click();
  await page.locator('#query').fill('林舟');
  await expect(page.locator('[data-action^="match-hit:"]')).toHaveCount(2);
  await page.locator('[data-action="match-hit:1"]').click();
  await expect(page.locator('.manuscript[contenteditable]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('林舟');
});

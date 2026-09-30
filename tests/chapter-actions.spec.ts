import { test, expect } from './seed';
import { toShelf } from './seed';
import { selectTxt } from './txt-helper';

test('dragging a scrolled chapter list retains viewport and persists order', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '书架菜单', exact: true }).click();
  const text = Array.from({ length: 35 }, (_, i) => `第${i + 1}章\n正文。\n`).join('');
  await selectTxt(page, '拖动测试.txt', text);
  await expect(page.locator('#txt-confirm')).toBeEnabled();
  await page.locator('#txt-confirm').click();
  await page.locator('.book').filter({ hasText: '拖动测试' }).click();
  await page.locator('[data-action="manage-chapters"]').click();
  const list = page.locator('.chapter-list');
  await list.evaluate(el => { el.scrollTop = 740; });
  const scroll = await list.evaluate(el => el.scrollTop);
  const from = page.locator('[data-chapter-index="12"]');
  const box = (await from.boundingBox())!;
  const oldTitle = await from.locator('strong').innerText();
  const listNode = await list.elementHandle();
  await page.mouse.move(box.x + 140, box.y + 25);
  await page.mouse.down();
  await page.mouse.move(box.x + 140, box.y + 120, { steps: 15 });
  await page.mouse.up();
  await expect(page.locator('[data-chapter-index="13"] strong')).toHaveText(oldTitle);
  expect(await listNode!.evaluate(el => el === document.querySelector('.chapter-list'))).toBe(true);
  expect(await list.evaluate(el => el.scrollTop)).toBe(scroll);
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await expect(page.locator('.save-status')).toHaveText('已保存');
  await page.reload();
  await toShelf(page);
  await page.locator('.book').filter({ hasText: '拖动测试' }).click();
  await expect(page.locator('[data-action="chapter:13"] strong')).toHaveText(oldTitle);
});

test('directory centers the current chapter and jumps by chapter number', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '书架菜单', exact: true }).click();
  const text = Array.from({ length: 60 }, (_, i) => `第${i + 1}章\n正文 ${i + 1}。\n`).join('');
  await selectTxt(page, '目录跳章.txt', text);
  await expect(page.locator('#txt-confirm')).toBeEnabled();
  await page.locator('#txt-confirm').click();
  await page.locator('.book').filter({ hasText: '目录跳章' }).click();
  await page.locator('[data-action="chapter:49"]').click();
  await page.locator('[data-action="tool:directory"]').click();
  await expect(page.locator('#directory-jump')).toBeVisible();
  const currentVisible = await page.locator('#sheet .chapter-row.current').evaluate(row => {
    const rowRect = row.getBoundingClientRect();
    const contentRect = row.closest('.sheet-content')!.getBoundingClientRect();
    return rowRect.top >= contentRect.top && rowRect.bottom <= contentRect.bottom;
  });
  expect(currentVisible).toBe(true);
  const fastScroll = page.locator('.directory-sheet .fast-scroll');
  await expect(fastScroll).toHaveCount(1);
  const handle = (await fastScroll.boundingBox())!;
  const content = (await page.locator('.directory-sheet .sheet-content').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, content.y + content.height - 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => page.locator('.directory-sheet .sheet-content').evaluate(element => Math.round(element.scrollHeight - element.clientHeight - element.scrollTop))).toBeLessThanOrEqual(2);
  await page.getByLabel('跳到第几章').fill('10');
  await page.locator('#directory-jump').evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(page.locator('.editor-heading')).toHaveText('第10章');
});

test('returning from editing restores chapter list position and highlights the chapter', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '书架菜单', exact: true }).click();
  const text = Array.from({ length: 60 }, (_, i) => `第${i + 1}章\n正文 ${i + 1}。\n`).join('');
  await selectTxt(page, '章节位置.txt', text);
  await expect(page.locator('#txt-confirm')).toBeEnabled();
  await page.locator('#txt-confirm').click();
  await page.locator('.book').filter({ hasText: '章节位置' }).click();
  const chapter = page.locator('[data-action="chapter:39"]');
  await chapter.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => scrollY);
  await chapter.click();
  await page.getByRole('button', { name: '返回目录', exact: true }).click();
  await expect(page.locator('[data-action="chapter:39"]')).toHaveClass(/just-edited/);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  expect(Math.abs(await page.evaluate(() => scrollY) - before)).toBeLessThan(10);
});

test('new chapter opens the editor with its full title selected', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  await page.getByRole('button', { name: '新建章节', exact: true }).last().click();
  await expect(page.locator('.editor-heading')).toHaveText('第4章');
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('第4章');
});

test('new next chapter is inserted immediately after the current chapter', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  await page.locator('[data-action="chapter:0"]').click();
  await page.getByRole('button', { name: '更多工具', exact: true }).click();
  await page.getByRole('button', { name: '新建下一章', exact: true }).click();
  await expect(page.locator('.editor-heading')).toHaveText('第2章');
  await page.getByRole('button', { name: '返回目录', exact: true }).click();
  await expect(page.locator('.chapter-row')).toHaveCount(4);
  await expect(page.locator('[data-action="chapter:1"] strong')).toHaveText('第2章');
  await expect(page.locator('[data-action="chapter:2"] strong')).toHaveText('第2章  旧书店');
});

test('opening and closing the book menu keeps chapter svg nodes', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  const first = page.locator('.chapter-list .chapter-row svg').first();
  const node = await first.elementHandle();
  await page.getByRole('button', { name: '书籍菜单', exact: true }).click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  expect(await node!.evaluate(svg => svg === document.querySelector('.chapter-list .chapter-row svg'))).toBe(true);
});

test('chapter swipe reveals deletion, cancel preserves and confirm deletes', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  const row = page.locator('[data-action="chapter:0"]');
  const bounds = (await row.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width - 30, bounds.y + 25);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width - 140, bounds.y + 25, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.chapter-swipe.swiped')).toHaveCount(1);
  await page.locator('[data-action="delete-chapter:0"]').click();
  await expect(page.locator('.chapter-swipe.swiped')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.chapter-swipe')).toHaveCount(3);
  await expect(page.locator('.chapter-swipe.swiped')).toHaveCount(0);
  await page.mouse.move(bounds.x + bounds.width - 30, bounds.y + 25);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width - 140, bounds.y + 25, { steps: 8 });
  await page.mouse.up();
  await page.locator('[data-action="delete-chapter:0"]').click();
  await page.locator('[data-action^="confirm-single-chapter:"]').click();
  await expect(page.locator('.chapter-swipe')).toHaveCount(2);
  await expect(page.locator('.save-status')).toHaveText('已保存');
  await page.reload();
  await toShelf(page);
  await page.locator('[data-action="book:1"]').click();
  await expect(page.locator('.chapter-swipe')).toHaveCount(2);
});

test('management selects entire rows without replacing footer and leaves last chapter visible', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  await page.locator('[data-action="manage-chapters"]').click();
  await expect(page.locator('.chapter-managing .drag-handle')).toHaveCount(0);
  const footer = await page.locator('.chapter-batch-footer').elementHandle();
  const row = page.locator('[data-action="select-chapter:0"]');
  const box = (await row.boundingBox())!;
  await row.click({ position: { x: box.width - 12, y: 25 } });
  await expect(row).toHaveAttribute('aria-pressed', 'true');
  await row.click();
  await expect(row).toHaveAttribute('aria-pressed', 'false');
  expect(await row.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(await page.locator('.chapter-batch-footer').evaluate(el => getComputedStyle(el).backgroundColor));
  expect(await footer!.evaluate(el => el === document.querySelector('.chapter-batch-footer'))).toBe(true);
  await page.locator('[data-action="select-all-chapters"]').click();
  await expect(page.locator('[aria-pressed="true"][data-chapter-index]')).toHaveCount(3);
  const list = await page.locator('.chapter-list').boundingBox();
  const bottom = await page.locator('.chapter-batch-footer').boundingBox();
  expect(list!.y + list!.height).toBeLessThanOrEqual(bottom!.y + 1);
  await page.screenshot({ path: 'test-results/chapter-management.png', animations: 'disabled' });
});

test('library management blocks folders and toggles select all', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="home-menu"]').click();
  await page.locator('[data-action="batch"]').click();
  await page.locator('[data-action="folder:1"]').click();
  await expect(page.locator('#notice')).toContainText('先点“完成”退出管理');
  await expect(page.locator('.library-managing')).toBeVisible();
  await page.locator('[data-action="select-all"]').click();
  await expect(page.locator('[data-action="select-all"]')).toContainText('取消全选');
  await page.locator('[data-action="select-all"]').click();
  await expect(page.locator('[data-action="select-all"]')).toContainText('全选');
});

test('library management shows the selected book checkbox in grid and list views', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="home-menu"]').click();
  await page.locator('[data-action="batch"]').click();
  const book = page.locator('[data-book-id="1"]');
  await expect(book.locator('.book-selection')).toHaveCount(1);
  await expect(book.locator('.book-selection .lucide-square')).toHaveCount(1);
  await book.click();
  await expect(book).toHaveAttribute('aria-pressed', 'true');
  await expect(book.locator('.book-selection .lucide-square-check')).toHaveCount(1);
  await page.locator('.library-managing > .topbar [data-action="batch"]').click();
  await page.locator('[data-action="home-menu"]').click();
  await page.locator('[data-action="view:list"]').click();
  await page.locator('[data-action="home-menu"]').click();
  await page.locator('[data-action="batch"]').click();
  await expect(page.locator('[data-book-id="1"] .book-selection')).toBeVisible();
});

test('long press enters writing library and chapter management with the target selected', async ({ page }) => {
  await page.goto('/');
  const book = page.locator('[data-book-id="1"]');
  await book.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: 30, clientY: 30 });
  await page.waitForTimeout(550);
  await book.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: 30, clientY: 30 });
  await expect(page.locator('.library-managing [data-book-id="1"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-action="batch"]').click();
  await page.locator('[data-action="book:1"]').click();
  const chapter = page.locator('[data-action="chapter:1"]');
  await chapter.dispatchEvent('pointerdown', { pointerId: 2, pointerType: 'touch', isPrimary: true, clientX: 30, clientY: 30 });
  await page.waitForTimeout(550);
  await page.locator('main').dispatchEvent('pointerup', { pointerId: 2, pointerType: 'touch', isPrimary: true, clientX: 30, clientY: 30 });
  await expect(page.locator('.chapter-managing [data-action="select-chapter:1"]')).toHaveAttribute('aria-pressed', 'true');
});

test('chapter management moves selected chapters together while preserving their order', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  await page.locator('[data-action="manage-chapters"]').click();
  await page.locator('[data-action="select-chapter:0"]').click();
  await page.locator('[data-action="select-chapter:1"]').click();
  await page.locator('[data-action="move-chapters"]').click();
  await page.locator('[data-action="move-chapters-to:last"]').click();
  await expect(page.locator('.chapter-row strong')).toHaveText(['第3章  一封来信', '第1章  归途', '第2章  旧书店']);
  await expect(page.locator('[data-action="select-chapter:1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-action="select-chapter:2"]')).toHaveAttribute('aria-pressed', 'true');
});

test('undo redo availability follows edits, undo, redo and new input', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  await page.locator('[data-action="chapter:0"]').click();
  const undo = page.locator('[data-action="tool:undo"]'), redo = page.locator('[data-action="tool:redo"]');
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  await page.getByRole('textbox', { name: '章节正文', exact: true }).fill('改动');
  await expect(undo).toBeEnabled();
  await page.getByRole('button', { name: '收起键盘', exact: true }).click();
  await undo.click();
  expect(await page.evaluate(() => document.activeElement?.hasAttribute('contenteditable'))).toBe(false);
  await expect(undo).toBeDisabled();
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(redo).toBeDisabled();
  await undo.click();
  await page.getByRole('textbox', { name: '章节正文', exact: true }).fill('新的改动');
  await expect(redo).toBeDisabled();
});

test('whole book formatting applies immediately and can be undone from the book menu', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  await page.locator('[data-action="chapter:0"]').click();
  const body = page.getByRole('textbox', { name: '章节正文', exact: true });
  const original = await body.innerText();
  await page.getByRole('button', { name: '返回目录', exact: true }).click();
  await page.getByRole('button', { name: '书籍菜单', exact: true }).click();
  await page.locator('[data-action="format-book"]').click();
  await expect(page.locator('#sheet')).not.toBeVisible();
  await page.getByRole('button', { name: '书籍菜单', exact: true }).click();
  await expect(page.locator('[data-action="undo-book-change"]')).toHaveText('撤销全书排版');
  await page.locator('[data-action="undo-book-change"]').click();
  await page.locator('[data-action="chapter:0"]').click();
  await expect(body).toHaveText(original);
  await page.getByRole('button', { name: '返回目录', exact: true }).click();
  await page.getByRole('button', { name: '书籍菜单', exact: true }).click();
  await page.locator('[data-action="format-book"]').click();
  await page.getByRole('button', { name: '返回书架', exact: true }).click();
  await page.locator('[data-action="book:1"]').click();
  await page.getByRole('button', { name: '书籍菜单', exact: true }).click();
  await expect(page.locator('[data-action="undo-book-change"]')).toHaveCount(0);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.locator('.chapter-page')).toBeVisible();
});

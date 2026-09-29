import { test, expect } from './seed';
import { toShelf } from './seed';
import type { Page } from '@playwright/test';
const body = (prefix: string) => Array.from({ length: 160 }, (_, i) => prefix + '第' + i + '行，这是一段用来验证位置的正文。').join('\n');
async function prepare(page: Page) {
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  for (const i of [0, 1]) {
    await page.locator('[data-action="chapter:' + i + '"]').click();
    await page.getByRole('textbox', { name: '章节正文', exact: true }).fill(body(i === 0 ? '甲' : '乙'));
    await page.getByRole('button', { name: '返回目录', exact: true }).click();
  }
  await page.getByRole('button', { name: '返回书架', exact: true }).click();
}
async function reading(page: Page) {
  await page.locator('[data-action="tab:read"]').click();
  await page.locator('[data-action="book:1"]').click();
}
async function controls(page: Page) {
  await page.locator('.editor-scroll').click({ position: { x: 200, y: 300 } });
  await expect(page.locator('.reader')).toHaveClass(/controls/);
}

test('continuous scroll changes active chapter, restores by text and keeps position after typography changes', async ({ page }) => {
  await prepare(page);
  await reading(page);
  await expect(page.locator('.reading-chapter')).toHaveCount(3);
  await page.locator('.reading-chapter').nth(1).evaluate(element => {
    const scroll = element.parentElement!;
    scroll.scrollTop += element.getBoundingClientRect().top - scroll.getBoundingClientRect().top + 900;
  });
  await expect(page.locator('.reader-footer span').first()).toHaveText('第2章  旧书店');
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const req = indexedDB.open('local-editing-preview'); req.onsuccess = () => resolve(req.result); });
    const row: any = await new Promise(resolve => { const req = db.transaction('records').objectStore('records').get('reading'); req.onsuccess = () => resolve(req.result); });
    db.close();
    return row && JSON.parse(row.value)['1']?.anchor?.context;
  })).toContain('乙');
  await page.reload();
  await expect(page.locator('.reader')).toBeVisible();
  await expect(page.locator('.reader-footer span').first()).toHaveText('第2章  旧书店');
  const before = await page.locator('.editor-scroll').evaluate(el => el.scrollTop);
  await controls(page);
  await page.locator('[data-action="reader-settings"]').click();
  await page.locator('[data-action="pref:readfont:26"]').click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  expect(await page.locator('.editor-scroll').evaluate(el => el.scrollTop)).toBeGreaterThan(before);
  await expect(page.locator('.reader-footer span').first()).toHaveText('第2章  旧书店');
  await expect(page.locator('.manuscript[contenteditable]')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/reader-continuous.png' });
});

test('editor selection and scroll restore after chapter switch and reload', async ({ page }) => {
  await prepare(page);
  await page.locator('[data-action="book:1"]').click();
  await page.locator('[data-action="chapter:0"]').click();
  await page.locator('.manuscript').evaluate(element => {
    const range = document.createRange();
    range.setStart(element.firstChild!, 900);
    range.setEnd(element.firstChild!, 910);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
    element.parentElement!.scrollTop = 1500;
  });
  await page.getByRole('button', { name: '返回目录', exact: true }).click();
  await expect(page.locator('.save-status')).toHaveText('已保存');
  await page.reload();
  await toShelf(page);
  await page.locator('[data-action="book:1"]').click();
  await page.locator('[data-action="chapter:0"]').click();
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe(body('甲').slice(900, 910));
  expect(await page.locator('.editor-scroll').evaluate(el => el.scrollTop)).toBeGreaterThan(1000);
});

test('chapter progress seeks within the active chapter and viewport avoids bottom toolbar overlap', async ({ page }) => {
  await prepare(page);
  await reading(page);
  await controls(page);
  await page.locator('[data-action="reader-step:1"]').click();
  await page.locator('.reader-progress input').fill('50');
  await expect(page.locator('.reader-footer span').first()).toHaveText('第2章  旧书店');
  await expect(page.locator('#progress-value')).toHaveText('50%');
  await page.locator('[data-action="home"]').click();
  await page.locator('[data-action="tab:edit"]').click();
  await page.locator('[data-action="book:1"]').click();
  await page.locator('[data-action="chapter:0"]').click();
  await page.setViewportSize({ width: 390, height: 420 });
  await expect.poll(() => page.locator('.editor-bottom').evaluate(el => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(421);
  const rects = await page.evaluate(() => ({
    footer: document.querySelector('.editor-bottom')!.getBoundingClientRect().toJSON(),
    scroll: document.querySelector('.editor-scroll')!.getBoundingClientRect().toJSON(),
    height: visualViewport!.height,
  }));
  expect(rects.footer.bottom).toBeLessThanOrEqual(rects.height + 1);
  expect(rects.scroll.bottom).toBeLessThanOrEqual(rects.footer.top + 1);
});

test('reading shelf shows whole-book progress and sorts by most recent reading', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="tab:read"]').click();
  await page.locator('[data-action="book:2"]').click();
  await controls(page);
  await page.locator('.reader-progress input').fill('50');
  await expect(page.locator('#progress-value')).toHaveText('50%');
  await page.locator('[data-action="home"]').click();
  await expect(page.locator('[data-book-id="2"] .book-progress')).toHaveText('读到 50%');
  await expect(page.locator('[data-book-id="1"] .book-progress')).toHaveText('未读');
  await page.locator('[data-action="home-menu"]').click();
  await page.locator('[data-action="read-sort:recent"]').click();
  await expect(page.locator('.book').first()).toHaveAttribute('data-book-id', '2');
  await page.locator('[data-action="home-menu"]').click();
  await expect(page.locator('[data-action="read-sort:manual"]')).toContainText('按手动顺序排序');
});

test('settings keep panel and reading positions, isolate colors and center the heading', async ({ page }) => {
  await prepare(page);
  await reading(page);
  await page.locator('.editor-scroll').evaluate(el => { el.scrollTop = 1400; });
  await expect.poll(() => page.locator('.editor-scroll').evaluate(el => el.scrollTop)).toBe(1400);
  await controls(page);
  await expect(page.locator('[data-action="reader-menu"]')).toHaveCount(0);
  await page.locator('[data-action="reader-settings"]').click();
  const content = page.locator('#sheet .sheet-content');
  await content.evaluate(el => { el.scrollTop = el.scrollHeight; });
  const offset = await content.evaluate(el => el.scrollTop);
  const node = await content.elementHandle();
  const colors = await page.locator('#sheet').evaluate(el => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]);
  await page.locator('[data-action="pref:readpaper:#e4ede4"]').click();
  await page.locator('[data-action="pref:readcolor:#27313d"]').click();
  expect(await node!.evaluate(el => el === document.querySelector('#sheet .sheet-content'))).toBe(true);
  expect(await content.evaluate(el => el.scrollTop)).toBe(offset);
  expect(await page.locator('.editor-scroll').evaluate(el => el.scrollTop)).toBe(1400);
  expect(await page.locator('#sheet').evaluate(el => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color])).toEqual(colors);
  const title = (await page.locator('#sheet h2').boundingBox())!, sheet = (await page.locator('#sheet').boundingBox())!;
  expect(Math.abs(title.x + title.width / 2 - sheet.x - sheet.width / 2)).toBeLessThan(1);
  await page.screenshot({ path: 'test-results/reader-settings-fixed.png', animations: 'disabled' });
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.locator('[data-action="directory"]').click();
  expect(await page.locator('#sheet').evaluate(el => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color])).toEqual(colors);
});

test('chapter slider stays on the same chapter at both endpoints across repeated seeks', async ({ page }) => {
  await prepare(page);
  await reading(page);
  await controls(page);
  const slider = page.locator('.reader-progress input');
  for (const value of ['100', '0', '100', '0']) {
    await slider.fill(value);
    // Allow native scroll events and the scheduled chapter detection to settle.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.locator('.reader-footer span').first()).toHaveText('第1章  归途');
    await expect(page.locator('#progress-value')).toHaveText(value + '%');
  }
  await page.locator('[data-action="reader-step:1"]').click();
  await page.locator('[data-action="reader-step:1"]').click();
  for (const value of ['100', '0']) {
    await slider.fill(value);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.locator('.reader-footer span').first()).toHaveText('第3章  一封来信');
  }
});

test('home navigation indicator is centered over each selected button', async ({ page }) => {
  await page.goto('/');
  for (const tab of ['read', 'me', 'edit']) {
    await page.locator('[data-action="tab:' + tab + '"]').click();
    const delta = await page.locator('.bottom-nav button.active').evaluate(el => {
      const style = getComputedStyle(el, '::before');
      const transform = new DOMMatrix(style.transform);
      return parseFloat(style.left) + transform.m41 + parseFloat(style.width) / 2 - el.clientWidth / 2;
    });
    expect(Math.abs(delta)).toBeLessThan(1);
  }
});

test('day and night retain separate custom colors and long press does not open controls', async ({ page }) => {
  await page.goto('/');
  await reading(page);
  await controls(page);
  await page.locator('[data-action="reader-settings"]').click();
  await page.locator('[data-action="pref:readpaper:#e4ede4"]').click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.locator('[data-action="night"]').click();
  await expect(page.locator('[data-action="night"]')).toContainText('日间');
  await page.locator('[data-action="night"]').click();
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.reader')!).getPropertyValue('--paper').trim())).toBe('#e4ede4');
  await page.locator('.editor-scroll').click({ position: { x: 200, y: 300 } });
  await expect(page.locator('.reader')).not.toHaveClass(/controls/);
  const scroll = page.locator('.editor-scroll');
  await scroll.dispatchEvent('pointerdown', { clientX: 200, clientY: 300 });
  await page.waitForTimeout(550);
  await scroll.dispatchEvent('click', { clientX: 200, clientY: 300 });
  await expect(page.locator('.reader')).not.toHaveClass(/controls/);
});

test('grid repeat height follows computed text line height at fractional settings', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  await page.locator('[data-action="chapter:0"]').click();
  await page.locator('[data-action="tool:settings"]').click();
  await page.locator('[data-action="grid"]').click();
  await page.locator('[data-pref="grid"]').check();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.locator('[data-action="tool:settings"]').click();
  await page.locator('[data-action="settings:字体"]').click();
  await page.locator('[data-action="pref:font:18"]').click();
  await page.locator('[data-action="pref:line:1.7"]').click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  const values = await page.locator('.manuscript').evaluate(element => {
    const style = getComputedStyle(element);
    return { line: parseFloat(style.lineHeight), repeat: parseFloat(style.getPropertyValue('--rule-height')) };
  });
  expect(values.repeat).toBeCloseTo(values.line, 3);
  await page.screenshot({ path: 'test-results/editor-grid.png' });
});

test('theme presets update editor and reader colors and warn about low contrast', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  await page.locator('[data-action="chapter:0"]').click();
  await page.locator('[data-action="tool:settings"]').click();
  await page.locator('[data-action="settings:主题"]').click();
  await expect(page.locator('[data-action^="theme-preset:"]')).toHaveCount(5);
  await page.locator('[data-action="theme-preset:3"]').click();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--paper').trim())).toBe('#e4ede4');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--text').trim())).toBe('#2f3b36');
  await page.locator('[data-action="pref:color:#e9e4da"]').click();
  await expect(page.locator('.contrast-warning')).toContainText('可能看不清');

  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '返回目录', exact: true }).click();
  await page.getByRole('button', { name: '返回书架', exact: true }).click();
  await reading(page);
  await controls(page);
  await page.locator('[data-action="reader-settings"]').click();
  await expect(page.locator('[data-action^="read-preset:"]')).toHaveCount(5);
  await page.locator('[data-action="read-preset:4"]').click();
  expect(await page.locator('.reader').evaluate(el => getComputedStyle(el).getPropertyValue('--paper').trim())).toBe('#1b1a18');
  expect(await page.locator('.reader').evaluate(el => getComputedStyle(el).getPropertyValue('--text').trim())).toBe('#d9d3c7');
});

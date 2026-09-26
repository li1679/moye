import { test, expect } from './seed';
import type { Page } from '@playwright/test';

async function bookMenu(page: Page) {
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  await page.getByRole('button', { name: '书籍菜单', exact: true }).click();
}

async function centered(page: Page) {
  const head = (await page.locator('#sheet .sheet-head h2').boundingBox())!;
  const panel = (await page.locator('#sheet').boundingBox())!;
  expect(Math.abs(head.x + head.width / 2 - panel.x - panel.width / 2)).toBeLessThan(1);
}

test('Back restores parent menus, backdrop closes the full stack and reopening starts fresh', async ({ page }) => {
  await bookMenu(page);
  const menu = await page.locator('#sheet .sheet-content').elementHandle();
  await centered(page);
  await page.locator('[data-action="details"]').click();
  await centered(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#sheet h2')).toHaveText('书籍操作');
  expect(await menu!.evaluate(el => el === document.querySelector('#sheet .sheet-content'))).toBe(true);
  await page.locator('[data-action="edit-book"]').click();
  await page.locator('#book-name').fill('尚未提交');
  await page.getByRole('button', { name: '返回上一级', exact: true }).click();
  await expect(page.locator('#sheet h2')).toHaveText('书籍操作');
  await page.locator('[data-action="details"]').click();
  const box = (await page.locator('#sheet').boundingBox())!;
  await page.mouse.click(20, box.y - 10);
  await expect(page.locator('#sheet')).not.toBeVisible();
  await expect(page.locator('.chapter-page')).toBeVisible();
  await page.getByRole('button', { name: '书籍菜单', exact: true }).click();
  await expect(page.locator('[data-action="sheet-back"]')).toHaveCount(0);
  await page.locator('[data-action="details"]').click();
  await expect(page.locator('#sheet .sheet-content h2')).toHaveText('雨停之后');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('#sheet')).not.toBeVisible();
});

test('returning from replacement confirmation preserves search values, results and listeners', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  await page.locator('[data-action="chapter:0"]').click();
  await page.locator('[data-action="tool:find"]').click();
  await page.getByLabel('替换范围').selectOption('book');
  await page.locator('#query').fill('清晨');
  await page.locator('#replacement').fill('傍晚');
  await expect(page.locator('[data-action^="match-hit:"]')).toHaveCount(1);
  await page.locator('[data-action="replace"]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#query')).toHaveValue('清晨');
  await expect(page.locator('#replacement')).toHaveValue('傍晚');
  await page.getByLabel('替换范围').selectOption('chapter');
  await expect(page.locator('[data-action="replace"]')).toHaveText('替换本章全部');
  await expect(page.locator('[data-action^="match-hit:"]')).toHaveCount(1);
});

test('settings tabs and directory reversal replace their view without adding back levels', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  await page.locator('[data-action="chapter:0"]').click();
  await page.locator('[data-action="tool:settings"]').click();
  await page.locator('[data-action="settings:字体"]').click();
  await page.locator('[data-action="settings:基础"]').click();
  await page.locator('[data-action="grid"]').click();
  await page.locator('[data-pref="grid"]').check();
  await page.getByRole('button', { name: '返回上一级', exact: true }).click();
  await expect(page.locator('.sheet-tabs')).toBeVisible();
  await expect(page.locator('[data-action="grid"] .row-value')).toHaveText('已开启');
  await page.keyboard.press('Escape');
  await expect(page.locator('#sheet')).not.toBeVisible();
  await page.locator('[data-action="tool:directory"]').click();
  const sort = (await page.locator('[data-action="directory-sort"]').boundingBox())!;
  const close = (await page.locator('#sheet [data-action="close"]').boundingBox())!;
  expect(sort.x + sort.width).toBeLessThanOrEqual(close.x);
  expect(close.x - sort.x - sort.width).toBeLessThan(12);
  await page.locator('[data-action="directory-sort"]').click();
  await expect(page.locator('[data-action="sheet-back"]')).toHaveCount(0);
  await expect(page.locator('#sheet .chapter-row').first()).toContainText('第3章');
  await page.keyboard.press('Escape');
  await expect(page.locator('#sheet')).not.toBeVisible();
});

test('menu titles fit narrow screens and bookshelf keeps its established grid', async ({ page }) => {
  for (const width of [320, 390, 482, 1280]) {
    await page.setViewportSize({ width, height: 790 });
    await page.goto('/');
    const columns = await page.locator('.books').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    if (width < 700) expect(columns).toBe(3);
    else expect(columns).toBeGreaterThan(3);
    await page.getByRole('button', { name: '书架菜单', exact: true }).click();
    await centered(page);
    await page.locator('#sheet [data-action="new-book"]').click();
    await centered(page);
    expect(await page.locator('#sheet').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    if (width === 482) await page.screenshot({ path: 'test-results/navigation-library.png' });
  }
});

test('animations permit repeated navigation and picker cancellation without stuck overlays', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await bookMenu(page);
  await page.locator('[data-action="details"]').click();
  await expect.poll(() => page.locator('#sheet .sheet-content').evaluate(el => el.getAnimations().length)).toBe(0);
  await page.screenshot({ path: 'test-results/navigation-details.png' });
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Escape');
    await expect(page.locator('#sheet h2')).toHaveText('书籍操作');
    await page.locator('[data-action="details"]').click();
  }
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('#sheet')).not.toBeVisible();
  await page.locator('[data-action="chapter:0"]').click();
  await page.locator('[data-action="tool:settings"]').click();
  await page.locator('[data-action="settings:字体"]').click();
  for (let i = 0; i < 3; i++) {
    await page.locator('#font-family').click();
    await expect(page.locator('.app-picker[open]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.app-picker[open]')).toHaveCount(0);
  }
  await expect(page.locator('.app-picker')).toHaveCount(0);
  await expect(page.locator('#sheet')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#sheet')).not.toBeVisible();
  expect(errors).toEqual([]);
});

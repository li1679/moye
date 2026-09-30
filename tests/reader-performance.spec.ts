import { test, expect } from './seed';
import { selectTxt } from './txt-helper';

const longBody = Array.from({ length: 240 }, (_, index) => `第${index}行，连续阅读性能回归正文。`).join('\n');

test('reader retains complete chapter text without estimated offscreen geometry', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  await page.locator('[data-action="chapter:0"]').click();
  await page.getByRole('textbox', { name: '章节正文', exact: true }).fill(longBody);
  await page.getByRole('button', { name: '返回目录', exact: true }).click();
  await page.getByRole('button', { name: '返回书架', exact: true }).click();
  await page.locator('[data-action="tab:read"]').click();
  await page.locator('[data-action="book:1"]').click();

  const result = await page.locator('.editor-scroll').evaluate(scroll => ({
    chapterCount: scroll.querySelectorAll('.reading-chapter').length,
    text: scroll.querySelector<HTMLElement>('.reading-chapter[data-index="0"] .manuscript')?.textContent || '',
    realGeometry: Array.from(scroll.querySelectorAll<HTMLElement>('.reading-chapter')).every(section =>
      !section.style.getPropertyValue('content-visibility')
        && !section.style.getPropertyValue('contain-intrinsic-block-size')),
  }));

  expect(result.chapterCount).toBeLessThanOrEqual(5);
  expect(result.text).toContain(longBody);
  expect(result.realGeometry).toBe(true);
});

test('directory jump to the last chapter preserves progress endpoints', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="tab:read"]').click();
  await page.locator('[data-action="book:1"]').click();
  await expect(page.locator('#chapter-position')).toHaveText('1/3');

  const scroll = page.locator('.editor-scroll');
  await scroll.click({ position: { x: 200, y: 300 } });
  await expect(page.locator('.reader')).toHaveClass(/controls/);
  await page.locator('[data-action="directory"]').click();
  await page.locator('[data-action="jump-chapter:2"]').click();
  await expect(page.locator('.reader-footer span').first()).toHaveText('第3章  一封来信');
  await expect(page.locator('#chapter-position')).toHaveText('3/3');

  await page.locator('.reader-progress input').fill('0');
  await expect(page.locator('.reader-footer span').first()).toHaveText('第3章  一封来信');
  await expect(page.locator('#progress-value')).toHaveText('0%');
  expect(await scroll.locator('.reading-chapter[data-index="2"] .manuscript').textContent()).toBe('');

  await page.locator('.reader-progress input').fill('100');
  await expect(page.locator('.reader-footer span').first()).toHaveText('第3章  一封来信');
  await expect(page.locator('#progress-value')).toHaveText('100%');
});

test('font changes retain the active chapter and complete text', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="tab:read"]').click();
  await page.locator('[data-action="book:1"]').click();

  const scroll = page.locator('.editor-scroll');
  await scroll.evaluate(element => {
    const target = element.querySelector<HTMLElement>('.reading-chapter[data-index="1"]')!;
    element.scrollTop = target.offsetTop + 20;
  });
  await expect(page.locator('.reader-footer span').first()).toHaveText('第2章  旧书店');
  const before = await scroll.evaluate(element => ({
    top: element.scrollTop,
    context: element.querySelector<HTMLElement>('.reading-chapter[data-index="1"]')!.textContent,
  }));

  await scroll.click({ position: { x: 200, y: 300 } });
  await page.locator('[data-action="reader-settings"]').click();
  await page.locator('[data-action="pref:readfont:26"]').click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();

  await expect(page.locator('.reader-footer span').first()).toHaveText('第2章  旧书店');
  expect(await scroll.locator('.reading-chapter[data-index="1"]').textContent()).toBe(before.context);
  expect(await scroll.evaluate(element => element.scrollTop)).toBeGreaterThan(before.top);
});

test('reader window stays bounded and centers a distant directory jump', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '书架菜单', exact: true }).click();
  const text = Array.from({ length: 12 }, (_, index) => `第${index + 1}章\n${longBody}\n`).join('');
  await selectTxt(page, '窗口阅读.txt', text);
  await expect(page.locator('#txt-confirm')).toBeEnabled();
  await page.locator('#txt-confirm').click();
  await page.locator('[data-action="tab:read"]').click();
  await page.locator('.book').filter({ hasText: '窗口阅读' }).click();
  await page.locator('.editor-scroll').click({ position: { x: 200, y: 300 } });
  await page.locator('[data-action="directory"]').click();
  await page.locator('[data-action="jump-chapter:6"]').click();
  await expect(page.locator('.reading-chapter[data-index="6"]')).toBeVisible();
  expect(await page.locator('.reading-chapter').count()).toBeLessThanOrEqual(5);
});

test('directory jump keeps the mounted reader scroll node', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="tab:read"]').click();
  await page.locator('[data-action="book:1"]').click();
  const scroll = page.locator('.editor-scroll');
  const node = await scroll.elementHandle();
  await scroll.click({ position: { x: 200, y: 300 } });
  await page.locator('[data-action="directory"]').click();
  await page.locator('[data-action="jump-chapter:2"]').click();
  await expect(page.locator('.reading-chapter[data-index="2"]')).toBeVisible();
  expect(await node!.evaluate(element => element === document.querySelector('.editor-scroll'))).toBe(true);
});

test('sixty short chapters keep loading until the final chapter', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '书架菜单', exact: true }).click();
  const text = Array.from({ length: 60 }, (_, index) => `第${index + 1}章\n正文 ${index + 1}。\n`).join('');
  await selectTxt(page, '短章连续阅读.txt', text);
  await expect(page.locator('#txt-confirm')).toBeEnabled();
  await page.locator('#txt-confirm').click();
  await page.locator('[data-action="tab:read"]').click();
  await page.locator('.book').filter({ hasText: '短章连续阅读' }).click();
  const scroll = page.locator('.editor-scroll');
  for (let attempt = 0; attempt < 80 && await page.locator('.reading-chapter[data-index="59"]').count() === 0; attempt++) {
    await scroll.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  await expect(page.locator('.reading-chapter[data-index="59"]')).toBeVisible();
  await expect(page.locator('.reading-end')).toBeVisible();
});

import { test, expect } from './seed';

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
    text: Array.from(scroll.querySelectorAll('.reading-chapter .manuscript'))
      .map(element => element.textContent || '').join(''),
    realGeometry: Array.from(scroll.querySelectorAll<HTMLElement>('.reading-chapter')).every(section =>
      !section.style.getPropertyValue('content-visibility')
        && !section.style.getPropertyValue('contain-intrinsic-block-size')),
  }));

  expect(result.chapterCount).toBe(3);
  expect(result.text).toContain(longBody);
  expect(result.realGeometry).toBe(true);
});

test('directory jump to the last chapter preserves progress endpoints', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="tab:read"]').click();
  await page.locator('[data-action="book:1"]').click();

  const scroll = page.locator('.editor-scroll');
  await scroll.click({ position: { x: 200, y: 300 } });
  await expect(page.locator('.reader')).toHaveClass(/controls/);
  await page.locator('[data-action="directory"]').click();
  await page.locator('[data-action="jump-chapter:2"]').click();
  await expect(page.locator('.reader-footer span').first()).toHaveText('第3章  一封来信');

  await page.locator('.reader-progress input').fill('0');
  await expect(page.locator('.reader-footer span').first()).toHaveText('第3章  一封来信');
  await expect(page.locator('#progress-value')).toHaveText('0%');
  expect(await scroll.locator('.reading-chapter').nth(2).locator('.manuscript').textContent()).toBe('');

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
    const target = element.querySelectorAll('.reading-chapter')[1] as HTMLElement;
    element.scrollTop = target.offsetTop + 20;
  });
  await expect(page.locator('.reader-footer span').first()).toHaveText('第2章  旧书店');
  const before = await scroll.evaluate(element => ({
    top: element.scrollTop,
    context: element.querySelectorAll('.reading-chapter')[1].textContent,
  }));

  await scroll.click({ position: { x: 200, y: 300 } });
  await page.locator('[data-action="reader-settings"]').click();
  await page.locator('[data-action="pref:readfont:26"]').click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();

  await expect(page.locator('.reader-footer span').first()).toHaveText('第2章  旧书店');
  expect(await scroll.locator('.reading-chapter').nth(1).textContent()).toBe(before.context);
  expect(await scroll.evaluate(element => element.scrollTop)).toBeGreaterThan(before.top);
});

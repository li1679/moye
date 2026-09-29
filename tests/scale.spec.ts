import { test, expect } from '@playwright/test';
import { seedBigLibrary } from './fixtures/big-library';

test.setTimeout(180_000);

test('大书库性能基线', async ({ page }) => {
  await seedBigLibrary(page);
  const timings: [string, number][] = [];
  const step = async (label: string, run: () => Promise<void>) => {
    const start = Date.now();
    await run();
    timings.push([label, Date.now() - start]);
  };

  await step('从打开首页到 .books 可见', async () => {
    await page.goto('/');
    await page.locator('.books').waitFor();
  });

  await step('点书，到章节列表出现 1500 行', async () => {
    await page.locator('[data-action="book:1"]').click();
    await expect(page.locator('.chapter-list .chapter-row')).toHaveCount(1500);
  });

  await step('回书架切到阅读点书，到第一章正文可见', async () => {
    await page.locator('[data-action="home"]').click();
    await page.locator('[data-action="tab:read"]').click();
    await page.locator('[data-action="book:1"]').click();
    await expect(page.locator('.reading-chapter .manuscript').first()).toBeVisible();
  });
  expect(await page.locator('.reading-chapter').count()).toBeLessThanOrEqual(5);

  await step('点正文中部呼出控制栏后打开目录，到目录出现 1500 行', async () => {
    const box = await page.locator('.editor-scroll').boundingBox();
    await page.locator('.editor-scroll').click({ position: { x: box!.width / 2, y: box!.height / 2 } });
    await expect(page.locator('.reader.controls')).toBeVisible();
    await page.locator('[data-action="directory"]').click();
    await expect(page.locator('.directory-sheet .chapter-row')).toHaveCount(1500);
  });

  await step('点 jump-chapter:1000，到页脚第一个 span 显示"第1001章"', async () => {
    await page.locator('[data-action="jump-chapter:1000"]').click();
    await expect(page.locator('.reader-footer span').first()).toHaveText('第1001章');
  });
  expect(await page.locator('.reading-chapter').count()).toBeLessThanOrEqual(5);

  for (const [label, ms] of timings) {
    test.info().annotations.push({ type: 'timing', description: `${label}: ${ms} ms` });
    console.log(`${label}: ${ms} ms`);
  }
  expect(timings[2][1], '打开阅读器耗时').toBeLessThan(2000);
  expect(timings[4][1], '目录跳章耗时').toBeLessThan(1500);
});

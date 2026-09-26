import { test, expect } from './seed';

test('select uses app sheet, cancellation preserves value and selection updates the original form', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '书架菜单', exact: true }).click();
  await page.locator('[data-action="import"]').click();
  await page.locator('#txt-mode').click();
  await expect(page.getByRole('dialog', { name: '章节识别', exact: true })).toBeVisible();
  await expect(page.locator('.app-picker').getByRole('option', { name: '自动识别章节', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('#txt-mode')).toHaveValue('auto');
  await expect(page.locator('#sheet')).toBeVisible();
  await page.locator('#txt-mode').click();
  await page.locator('.app-picker').getByRole('option', { name: '整篇作为一章', exact: true }).click();
  await expect(page.locator('#txt-mode')).toHaveValue('single');
  await page.locator('#txt-file').setInputFiles({ name: '选择测试.txt', mimeType: 'text/plain', buffer: Buffer.from('第1章\n正文\n第2章\n正文') });
  await expect(page.locator('#txt-chapter option')).toHaveCount(1);
  await page.locator('#txt-mode').focus();
  await page.keyboard.press('Enter');
  await page.locator('.app-picker').getByRole('option', { name: '自动识别章节', exact: true }).click();
  await expect(page.locator('#txt-chapter option')).toHaveCount(2);
  await page.locator('#txt-chapter').click();
  await expect(page.locator('.app-picker').getByRole('option', { name: '第2章', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/app-select.png', animations: 'disabled' });
});

test('custom color has preview and validation, cancel discards and apply persists', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 790 });
  await page.goto('/');
  await page.locator('[data-action="tab:read"]').click();
  await page.locator('[data-action="book:1"]').click();
  await page.locator('.editor-scroll').click({ position: { x: 160, y: 300 } });
  await page.locator('[data-action="reader-settings"]').click();
  const input = page.getByLabel('自定义背景颜色', { exact: true });
  const original = await input.inputValue();
  await input.click();
  await page.getByRole('textbox', { name: '颜色值' }).fill('#123456');
  await expect(page.locator('.color-preview')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(input).toHaveValue(original);
  await input.click();
  await page.getByRole('textbox', { name: '颜色值' }).fill('bad');
  await page.getByRole('button', { name: '应用颜色' }).click();
  await expect(page.locator('.app-picker [role="alert"]')).toContainText('六位颜色值');
  await page.getByRole('textbox', { name: '颜色值' }).fill('#123456');
  await page.screenshot({ path: 'test-results/app-color.png', animations: 'disabled' });
  await page.getByRole('button', { name: '应用颜色' }).click();
  await expect(input).toHaveValue('#123456');
  expect(await page.locator('.reader').evaluate(el => getComputedStyle(el).getPropertyValue('--paper').trim())).toBe('#123456');
  await expect(page.locator('#sheet')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('format shows no completion or no-change notice', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  await page.locator('[data-action="chapter:0"]').click();
  await page.locator('[data-action="tool:format"]').click();
  await expect(page.locator('#notice')).not.toHaveClass(/visible/);
  await page.locator('[data-action="tool:format"]').click();
  await expect(page.locator('#notice')).not.toHaveClass(/visible/);
});

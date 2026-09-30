import type { Page } from '@playwright/test';

/** 点击导入直接打开系统文件选择器，不再先打开带文件输入框的面板。 */
export async function selectTxt(page: Page, name: string, source: string, action = 'import') {
  const chooser = page.waitForEvent('filechooser');
  await page.locator(`[data-action="${action}"]`).click();
  await (await chooser).setFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(source) });
}

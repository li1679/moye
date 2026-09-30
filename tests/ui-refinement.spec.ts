import { expect, test } from './seed';
import type { Page } from '@playwright/test';

async function openEditor(page: Page) {
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  await page.locator('[data-action="chapter:0"]').click();
}

test.describe('墨页 UI refinement', () => {
  test('uses the new product name and keeps compact controls tappable', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('墨页');

    await page.setViewportSize({ width: 360, height: 740 });
    const controls = page.locator('.icon, .chapter-step, .reader-bottom button, .steps button');
    const count = await controls.count();
    for (let index = 0; index < count; index += 1) {
      const box = await controls.nth(index).boundingBox();
      if (box) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('does not impose a 390px settings minimum in short landscape', async ({ page }) => {
    await page.setViewportSize({ width: 740, height: 320 });
    await page.goto('/');
    const settings = page.locator('.settings-sheet');
    if (await settings.count()) {
      const box = await settings.first().boundingBox();
      if (box) expect(box.height).toBeLessThanOrEqual(304);
    }
  });

  test('uses full-width navigation and paper-ink sheet controls', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/');
    const nav = page.locator('.bottom-nav');
    const navBox = (await nav.boundingBox())!;
    expect(navBox.x).toBe(0);
    expect(navBox.width).toBe(360);
    const indicator = await page.locator('.bottom-nav button.active').evaluate(button => {
      const style = getComputedStyle(button, '::before');
      return { width: style.width, height: style.height, color: style.backgroundColor };
    });
    expect(indicator).toEqual({ width: '24px', height: '2px', color: 'rgb(179, 58, 46)' });

    await page.locator('[data-action="new-book"]').click();
    const sheet = page.locator('#sheet');
    await expect(sheet).toHaveCSS('background-color', 'rgb(246, 241, 231)');
    expect(await sheet.evaluate(el => getComputedStyle(el, '::before').display)).toBe('none');
    await expect(sheet.locator('.primary')).toHaveCSS('background-color', 'rgb(31, 29, 26)');
    await expect(sheet.locator('.primary')).toHaveCSS('color', 'rgb(246, 241, 231)');
  });

  test('system dark mode does not override the selected application theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('.home')).toHaveCSS('background-color', 'rgb(246, 241, 231)');
  });

  test('serves the generated Moye seal as the favicon', async ({ page, request }) => {
    await page.goto('/');
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/brand/moye.svg');
    const response = await request.get('/brand/moye.svg');
    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain('viewBox="0 0 108 108"');
  });

  test('marks the editor top toolbar as overflowing at 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await openEditor(page);
    await expect(page.locator('.editor-tools')).toHaveClass(/\boverflowing\b/);
  });

  test('shows the tool name after a long press without running the tool', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await openEditor(page);
    const manuscript = page.getByRole('textbox', { name: '章节正文', exact: true });
    await manuscript.fill('长按前正文');
    const undo = page.locator('[data-action="tool:undo"]');
    const box = await undo.boundingBox();
    if (!box) throw new Error('撤销按钮不可见');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();
    await expect(page.locator('#notice')).toHaveText('撤销');
    await expect(manuscript).toHaveText('长按前正文');
  });

  test('applies the editor font through the shared body font variable', async ({ page }) => {
    await openEditor(page);
    await page.locator('[data-action="tool:settings"]').click();
    await page.locator('[data-action="settings:字体"]').click();
    await page.locator('#font-family').selectOption('黑体');
    await expect(page.locator('#font-family')).toHaveValue('黑体');
    const font = await page.evaluate(() => ({
      variable: document.documentElement.style.getPropertyValue('--body-font'),
      inline: (document.querySelector('.manuscript') as HTMLElement).style.fontFamily,
      computed: getComputedStyle(document.querySelector('.manuscript')!).fontFamily,
    }));
    expect(font.variable).toBe('var(--font-sans-cjk)');
    expect(font.inline).toBe('');
    expect(font.computed).toContain('Noto Sans CJK SC');
  });

  test('shows the package version and privacy message in about', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-action="tab:me"]').click();
    await page.locator('[data-action="about"]').click();
    await expect(page.locator('.sheet-content')).toContainText('墨页 1.1.0');
    await expect(page.locator('.sheet-content')).toContainText('本地阅读，随心改文');
    await expect(page.locator('.sheet-content')).toContainText('所有数据只保存在本机，不联网。');
  });

  test('uses the revised book and display wording and focuses title search', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-action="new-book"]').click();
    await expect(page.locator('#book-form')).toContainText('书名');
    await expect(page.locator('#book-form')).not.toContainText('书籍名称');
    await page.locator('[data-action="close"]').click();
    await page.locator('[data-action="title-search"]').click();
    await expect(page.locator('#query')).toBeFocused();
    await expect(page.locator('#query')).toHaveAttribute('aria-label', '书名');
    await page.locator('[data-action="close"]').click();
    await openEditor(page);
    await expect(page.locator('[data-action="tool:copy"]')).toHaveAttribute('aria-label', '复制正文');
    await expect(page.locator('[data-action="tool:settings"]')).toHaveAttribute('aria-label', '显示设置');
  });

  test('uses writing reading and settings navigation with three settings actions', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.bottom-nav span')).toHaveText(['写作', '阅读', '设置']);
    await page.locator('[data-action="tab:me"]').click();
    await expect(page.locator('.topbar h1')).toHaveText('设置');
    await expect(page.locator('.profile-intro h2')).toHaveText('墨页 1.1.0');
    await expect(page.locator('[data-action="import"]')).toHaveCount(0);
    for (const action of ['backup', 'cache', 'about']) {
      await expect(page.locator(`[data-action="${action}"]`)).toBeVisible();
    }
  });

  test('keeps backup and global search out of the shelf menu', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-action="home-menu"]').click();
    await expect(page.locator('[data-action="backup"]')).toHaveCount(0);
    await expect(page.locator('[data-action="global-search"]')).toHaveCount(0);
    await expect(page.locator('[data-action="import"]')).toBeVisible();
  });

  test('switches the combined search between title and full text', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-action="title-search"]')).toHaveAttribute('aria-label', '搜索');
    await page.locator('[data-action="title-search"]').click();
    await expect(page.locator('[data-action="search-tab:title"]')).toHaveText('书名');
    await expect(page.locator('[data-action="search-tab:text"]')).toHaveText('全文');
    await page.locator('#query').fill('雨停');
    await expect(page.locator('#search-results')).toContainText('雨停之后');
    await page.locator('[data-action="search-tab:text"]').click();
    await expect(page.locator('#query')).toHaveValue('雨停');
    await page.locator('#query').fill('林舟');
    await expect(page.locator('#search-results')).toContainText('第1章', { timeout: 5000 });
    await page.locator('[data-action="search-tab:title"]').click();
    await expect(page.locator('#query')).toHaveValue('雨停');
  });

  test('groups display settings into four tabs with a formatting-rules notice', async ({ page }) => {
    await openEditor(page);
    await page.locator('[data-action="tool:settings"]').click();
    await expect(page.locator('.sheet-tabs [role="tab"]')).toHaveText(['版面', '字体', '主题', '排版规则']);
    await expect(page.locator('[data-action="chapter-search"]')).toHaveCount(0);
    await expect(page.locator('[data-action="export"]')).toHaveCount(0);
    await page.locator('[data-action="settings:排版规则"]').click();
    await expect(page.locator('.sheet-content')).toContainText('以下规则只在点“一键排版”时使用，不会改变当前显示。');
  });

  test('reader settings synchronize typography and shared custom colors independently', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-action="tab:read"]').click();
    await page.locator('[data-action="book:1"]').click();
    await page.locator('.editor-scroll').click({ position: { x: 200, y: 300 } });
    await page.locator('[data-action="reader-settings"]').click();
    const font = page.locator('[data-action="pref:readfont:26"]');
    await font.click();
    await expect(font).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.manuscript').first()).toHaveCSS('font-size', '26px');
    const colorInput = page.locator('input[aria-label="自定义背景颜色"]');
    await colorInput.evaluate((input: HTMLInputElement) => {
      input.value = '#e4ede4';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(colorInput).toHaveValue('#e4ede4');
    await expect(page.locator('[data-action="pref:readpaper:#e4ede4"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(font).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await page.locator('[data-action="home"]').click();
    await page.locator('[data-action="tab:edit"]').click();
    await page.locator('[data-action="book:1"]').click();
    await page.locator('[data-action="chapter:0"]').click();
    await expect(page.locator('.manuscript')).toHaveCSS('font-size', '20px');
    await expect(page.locator('.editor')).toHaveCSS('background-color', 'rgb(228, 237, 228)');
    await page.locator('[data-action="tool:settings"]').click();
    await page.locator('[data-action="settings:主题"]').click();
    await expect(page.locator('input[aria-label="自定义纸张颜色"]')).toHaveValue('#e4ede4');
  });

  test('editor title has no focus frame and toolbar scrollbar is hidden', async ({ page }) => {
    await openEditor(page);
    const title = page.getByRole('textbox', { name: '章节标题', exact: true });
    await title.focus();
    await expect(title).toHaveCSS('outline-style', 'none');
    const toolbar = page.locator('.editor-tools');
    await expect(toolbar).toHaveCSS('scrollbar-width', 'none');
    expect(await toolbar.evaluate(element => getComputedStyle(element, '::-webkit-scrollbar').display)).toBe('none');
    expect(await toolbar.evaluate(element => element.scrollWidth)).toBeGreaterThanOrEqual(await toolbar.evaluate(element => element.clientWidth));
  });
  test('safe areas protect toolbars while backgrounds reach the viewport edges', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
    await page.evaluate(() => {
      const root = document.documentElement;
      root.style.setProperty('--safe-area-inset-top', '30px');
      root.style.setProperty('--safe-area-inset-bottom', '24px');
      root.style.setProperty('--safe-area-inset-left', '12px');
      root.style.setProperty('--safe-area-inset-right', '12px');
    });
    await page.locator('[data-action="book:1"]').click();
    await page.locator('[data-action="chapter:0"]').click();
    const back = (await page.getByRole('button', { name: '返回目录', exact: true }).boundingBox())!;
    expect(back.y).toBeGreaterThanOrEqual(30);
    expect(back.x).toBeGreaterThanOrEqual(12);
    const bottom = page.locator('.editor-bottom');
    await expect(bottom).toHaveCSS('padding-bottom', '24px');
    const shell = (await page.locator('.editor').boundingBox())!;
    expect(shell.y).toBe(0);
    expect(shell.height).toBe(790);
    const tool = (await bottom.locator('button').first().boundingBox())!;
    expect(tool.y + tool.height).toBeLessThanOrEqual(790 - 24);
    await page.getByRole('button', { name: '返回目录', exact: true }).click();
    const chapterBack = (await page.getByRole('button', { name: '返回书架', exact: true }).boundingBox())!;
    expect(chapterBack.y).toBeGreaterThanOrEqual(30);
    await page.getByRole('button', { name: '返回书架', exact: true }).click();
    await page.locator('[data-action="tab:read"]').click();
    await page.locator('[data-action="book:1"]').click();
    const scroll = (await page.locator('.editor-scroll').boundingBox())!;
    expect(scroll.y).toBeGreaterThanOrEqual(30);
    await page.locator('.editor-scroll').click({ position: { x: 200, y: 300 } });
    await page.locator('[data-action="reader-settings"]').click();
    await expect(page.locator('#sheet')).toHaveCSS('padding-bottom', '24px');
    const sheet = (await page.locator('#sheet').boundingBox())!;
    expect(sheet.x).toBeGreaterThanOrEqual(12);
    expect(sheet.x + sheet.width).toBeLessThanOrEqual(482 - 12);
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await page.setViewportSize({ width: 790, height: 400 });
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--safe-area-inset-top', '0px');
      document.documentElement.style.setProperty('--safe-area-inset-left', '40px');
    });
    const search = (await page.locator('[data-action="book-search"]').boundingBox())!;
    expect(search.x + search.width).toBeLessThanOrEqual(790 - 12);
    const readerBack = (await page.getByRole('button', { name: '返回阅读书架', exact: true }).boundingBox())!;
    expect(readerBack.x).toBeGreaterThanOrEqual(40);
    await page.locator('[data-action="reader-settings"]').click();
    const landscapeSheet = (await page.locator('#sheet').boundingBox())!;
    expect(landscapeSheet.y).toBeGreaterThanOrEqual(0);
  });

  test('narrow asymmetric safe area keeps the entire sheet outside the cutout', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/');
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--safe-area-inset-left', '48px');
      document.documentElement.style.setProperty('--safe-area-inset-right', '0px');
    });
    await page.locator('[data-action="home-menu"]').click();
    const sheet = (await page.locator('#sheet').boundingBox())!;
    expect(sheet.x).toBeGreaterThanOrEqual(48);
    expect(sheet.x + sheet.width).toBeLessThanOrEqual(360);
  });

  test('directory sheet also respects an asymmetric cutout', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/');
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--safe-area-inset-left', '48px');
      document.documentElement.style.setProperty('--safe-area-inset-right', '0px');
    });
    await page.locator('[data-action="tab:read"]').click();
    await page.locator('[data-action="book:1"]').click();
    await page.locator('.editor-scroll').click({ position: { x: 180, y: 300 } });
    await page.locator('[data-action="directory"]').click();
    const sheet = (await page.locator('#sheet').boundingBox())!;
    expect(sheet.x).toBeGreaterThanOrEqual(48);
    expect(sheet.x + sheet.width).toBeLessThanOrEqual(360);
  });

});

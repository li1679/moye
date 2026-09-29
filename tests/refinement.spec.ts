import { test, expect } from './seed';
import { toShelf } from './seed';
import { SearchIndex } from '../app/features/editor/search-index';
import { formatText } from '../app/features/editor/text-tools';

test('search pages reuse bounded checkpoints and invalidate changed documents', () => {
  const index = new SearchIndex();
  const document = { bookId: 1, chapterId: 'a', bookName: '书', title: '章', body: '😀目标 '.repeat(250000) };
  index.patch({ upserts: [document], deletes: [], order: ['a'] });
  const first = index.search('目标', 0);
  expect(first.total).toBe(250000);
  expect(first.hits[0].offset).toBe(2);
  expect(index.diagnostics.checkpoints).toBeLessThanOrEqual(4096);
  index.patch({ upserts: [], deletes: [], order: ['a'] });
  const last = index.search('目标', 4999);
  expect(last.hits).toHaveLength(50);
  expect(last.hits[49].offset).toBe(249999 * 5 + 2);
  expect(index.diagnostics.scans).toBe(1);
  index.patch({ upserts: [{ ...document, body: '目标' }], deletes: [], order: ['a'] });
  expect(index.search('目标').total).toBe(1);
  expect(index.diagnostics.scans).toBe(2);
  index.patch({ upserts: [], deletes: ['a'], order: [] });
  expect(index.search('目标').total).toBe(0);
});

test('grid line and color updates retain live panel nodes, scroll and persisted value', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="book:1"]').click();
  await page.locator('[data-action="chapter:0"]').click();
  await page.locator('[data-action="tool:settings"]').click();
  await page.locator('[data-action="grid"]').click();
  await expect(page.locator('#sheet')).toHaveAttribute('aria-label', '网格线');
  await page.locator('[data-pref="grid"]').check();
  await page.evaluate(() => { (window as any).gridPanel = document.querySelector('#sheet .sheet-content'); (window as any).lineButton = document.querySelector('[data-action="line:实线"]'); });
  await page.locator('[data-action="line:实线"]').click();
  expect(await page.evaluate(() => (window as any).gridPanel === document.querySelector('#sheet .sheet-content') && (window as any).lineButton === document.querySelector('[data-action="line:实线"]'))).toBe(true);
  await expect(page.locator('[data-action="line:实线"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-action="pref:lineColor:#989b9d"]').click();
  expect(await page.evaluate(() => (window as any).gridPanel === document.querySelector('#sheet .sheet-content'))).toBe(true);
  await page.locator('[data-action="sheet-back"]').click();
  await expect(page.locator('#sheet')).toHaveAttribute('aria-label', '显示设置');
  await page.locator('[data-action="settings:排版规则"]').click();
  await page.locator('[data-action="close"]').click();
  await page.waitForTimeout(500);
  await page.reload();
  await toShelf(page);
  await page.locator('[data-action="book:1"]').click();
  await page.locator('[data-action="chapter:0"]').click();
  await page.locator('[data-action="tool:settings"]').click();
  await page.locator('[data-action="grid"]').click();
  await expect(page.locator('[data-action="line:实线"]')).toHaveClass(/selected/);
});

test('search client reuses worker and transfers no unchanged bodies between pages', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { SearchClient } = await import('/features/editor/search-client.ts');
    const NativeWorker = window.Worker;
    const sent: any[] = []; let created = 0;
    class TrackedWorker extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) { super(url, options); created++; }
      postMessage(message: any) { sent.push(message); super.postMessage(message); }
    }
    window.Worker = TrackedWorker as typeof Worker;
    const client = new SearchClient();
    try {
      const docs = [{ bookId: 1, chapterId: 'one', title: '章', bookName: '书', body: '目标 '.repeat(125) }];
      const first = await client.search(docs, '目标', 0);
      const next = await client.search(docs.map(document => ({ ...document })), '目标', 1);
      const changed = await client.search([{ ...docs[0], body: '目标' }], '目标', 0);
      return { created, first: first.total, next: next.hits[0].offset, changed: changed.total, patches: sent.map(message => message.patch.upserts.length) };
    } finally { client.dispose(); window.Worker = NativeWorker; }
  });
  expect(result).toEqual({ created: 1, first: 125, next: 150, changed: 1, patches: [1, 0, 1] });
});

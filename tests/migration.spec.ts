import { test, expect } from './seed';
import { toShelf } from './seed';

// 用自定义种子写一套版本 1 的行：recovery 行、内嵌封面、带换行的标题、无主的 reading 条目。
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const put = (store: IDBObjectStore, id: string, value: unknown) => store.put({ id, value: JSON.stringify(value) });
    const req = indexedDB.open('local-editing-preview', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('records', { keyPath: 'id' });
    req.onsuccess = () => {
      const db = req.result; const tx = db.transaction('records', 'readwrite'); const store = tx.objectStore('records');
      put(store, 'schema', 1);
      put(store, 'groups', [{ id: 1, name: '待整理' }]);
      put(store, 'book-order', [1]);
      put(store, 'book:1', { id: 1, name: '雨停之后', author: '林间', group: null, tone: 'rose', image: 'data:image/png;base64,aGVsbG8=', chapterIds: ['c0', 'c1'] });
      put(store, 'chapter:c0', { id: 'c0', name: '第1章\n归途', body: '正文一' });
      put(store, 'chapter:c1', { id: 'c1', name: '第2章', body: '正文二' });
      put(store, 'reading', { '1': { chapter: 0, scroll: 0 }, '999': { chapter: 0, scroll: 0 } });
      put(store, 'editing', {});
      put(store, 'prefs', { font: 20, line: 1.8, autoScroll: true, punctuation: false });
      put(store, 'recovery', []);
      tx.oncomplete = () => db.close();
    };
  });
});

async function readRows(page: import('@playwright/test').Page): Promise<Record<string, string>> {
  return page.evaluate(() => new Promise<Record<string, string>>((resolve, reject) => {
    const request = indexedDB.open('local-editing-preview', 1);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('records', 'readonly');
      const result: Record<string, string> = {};
      const cursor = tx.objectStore('records').openCursor();
      cursor.onsuccess = () => {
        if (cursor.result) { result[cursor.result.key as string] = cursor.result.value.value as string; cursor.result.continue(); }
        else { db.close(); resolve(result); }
      };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  }));
}

test('版本 1 数据在启动时迁移到版本 2', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.save-status')).toHaveText('已保存');
  const rows = await readRows(page);
  expect(rows['recovery']).toBeUndefined();
  expect(rows['schema']).toBe('2');
  expect(rows['cover:1']).toBe(JSON.stringify('data:image/png;base64,aGVsbG8='));
  const book = JSON.parse(rows['book:1']);
  expect(book).not.toHaveProperty('image');
  expect(book).not.toHaveProperty('tone');
  expect(JSON.parse(rows['chapter:c0']).name).toBe('第1章 归途');
  expect(JSON.parse(rows['reading'])).not.toHaveProperty('999');
  expect(JSON.parse(rows['prefs'])).not.toHaveProperty('autoScroll');
  expect(JSON.parse(rows['prefs'])).not.toHaveProperty('punctuation');
  await page.reload();
  await toShelf(page);
  await expect(page.locator('[data-action="book:1"] img')).toBeVisible();
  await expect(page.locator('[data-action="book:1"] .book-name')).toContainText('雨停之后');
});

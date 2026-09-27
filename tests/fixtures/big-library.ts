import type { Page } from '@playwright/test';

/** 按版本 1 格式预置一个大书库：schema 为 1，写 book-order、book:1（含 chapterIds）和各 chapter:* 行，写法与 tests/seed.ts 相同。 */
export function seedBigLibrary(page: Page, { chapters = 1500, charsPerChapter = 2000 } = {}) {
  return page.addInitScript(({ chapters, charsPerChapter }) => {
    const body = (index: number) => {
      let text = '';
      for (let n = 1; text.length < charsPerChapter; n++) text += `第${index + 1}章第${n}段。`;
      return (text.match(/[\s\S]{1,200}/g) ?? []).join('\n');   // 每 200 字换一行
    };
    const req = indexedDB.open('local-editing-preview', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('records', { keyPath: 'id' });
    req.onsuccess = () => {
      const db = req.result; const tx = db.transaction('records', 'readwrite'); const store = tx.objectStore('records');
      const check = store.get('schema');
      check.onsuccess = () => {
        if (check.result) return;
        const put = (id: string, value: unknown) => store.put({ id, value: JSON.stringify(value) });
        put('schema', 1);
        put('groups', []);
        const ids = Array.from({ length: chapters }, (_, i) => 'big-' + i);
        put('book-order', [1]);
        put('book:1', { id: 1, name: '大书库测试', author: '', group: null, tone: '', chapterIds: ids });
        ids.forEach((id, i) => put('chapter:' + id, { id, name: `第${i + 1}章`, body: body(i) }));
      };
      tx.oncomplete = () => db.close();
    };
  }, { chapters, charsPerChapter });
}

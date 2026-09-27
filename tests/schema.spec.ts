import { test, expect } from '@playwright/test';
import { emptyLibrary, toRows, fromRows, normalizeLibrary, normalizeSession, migrateRows, validateLibrary, type Library } from '../app/data/schema';

const sample =
  "清晨，街道还没有完全醒来。\n\n林舟推开窗，看见昨夜的雨停在树叶上。远处传来第一班电车的声音，沿着旧城的屋檐，慢慢走远。\n\n桌上放着一封没有署名的信。信纸折得很整齐，只有边角沾了一点潮气。\n\n“等到天晴，就回去看看吧。”\n\n他读了两遍，把信放进外套口袋。很多年没有踏上那条路，有些风景却一直留在记忆里：桥边的书店、午后的长椅，还有巷口那盏总是提前亮起的灯。\n\n楼下的小店已经开门。热气从蒸笼边缘升起，店主像往常一样擦着玻璃。林舟停下来，买了一份早餐，然后朝车站走去。\n\n今天的天空很明亮。";

/** books 和 groups 与 tests/seed.ts 相同（章节带 id），第 1 本多一个内嵌封面。 */
function seededLibrary(): Library {
  return {
    ...emptyLibrary(),
    books: [
      {
        id: 1, name: '雨停之后', author: '林间', group: null, image: 'data:image/png;base64,aGVsbG8=',
        chapters: [
          { id: 'test-1-0', name: '第1章  归途', body: sample },
          { id: 'test-1-1', name: '第2章  旧书店', body: '书店仍在街角。\n\n木门上的铜铃响了一声，午后的阳光落在书架边。' },
          { id: 'test-1-2', name: '第3章  一封来信', body: '' },
        ],
      },
      { id: 2, name: '山海拾记', author: '无名', group: null, chapters: [{ id: 'test-2-0', name: '第1章  山间', body: '风从山谷吹来，草木的影子落在石阶上。' }] },
      { id: 3, name: '长街来信', author: '', group: 1, chapters: [{ id: 'test-3-0', name: '第1章', body: '' }] },
    ],
    groups: [{ id: 1, name: '待整理' }],
  };
}

test('toRows 与 fromRows 往返一致', () => {
  const library = seededLibrary();
  const roundTripped = fromRows(new Map(toRows(library).map(row => [row.id, row.value]))).library;
  expect(roundTripped).toEqual(normalizeLibrary(library));
});

test('migrateRows 把版本 1 的行升级到版本 2', () => {
  const rows = new Map<string, string>();
  const put = (id: string, value: unknown) => rows.set(id, JSON.stringify(value));
  put('schema', 1);
  put('groups', [{ id: 1, name: '待整理' }]);
  put('book-order', [1]);
  put('book:1', { id: 1, name: '雨停之后', author: '林间', group: null, tone: 'rose', image: 'data:image/png;base64,aGVsbG8=', chapterIds: ['c0', 'c1'] });
  put('chapter:c0', { id: 'c0', name: '第1章\n归途', body: '正文' });
  put('chapter:c1', { id: 'c1', name: '第2章', body: '正文' });
  put('reading', { '1': { chapter: 0, scroll: 0 }, '999': { chapter: 0, scroll: 0 } });
  put('editing', { c0: { scroll: 0 }, nope: { scroll: 0 } });
  put('prefs', { font: 20, line: 1.8, indent: true, spaces: false, paragraph: '不限', margin: 24, bottom: 80, grid: false, near: true, thick: false, lineType: '短虚线', lineColor: '#dadde0', color: '#292d30', paper: '#ffffff', fontFamily: '系统默认', autoScroll: true, punctuation: false, bold: false });
  put('recovery', []);

  const { upserts, deletes } = migrateRows(rows);
  expect(upserts.at(-1)).toEqual({ id: 'schema', value: '2' });
  expect(deletes).toContain('recovery');
  const cover = upserts.find(row => row.id === 'cover:1');
  expect(cover).toBeDefined();
  expect(JSON.parse(cover!.value)).toBe('data:image/png;base64,aGVsbG8=');
  const book1 = upserts.find(row => row.id === 'book:1');
  expect(book1).toBeDefined();
  const bookData = JSON.parse(book1!.value);
  expect(bookData).not.toHaveProperty('image');
  expect(bookData).not.toHaveProperty('tone');
  const renamed = upserts.find(row => row.id === 'chapter:c0');
  expect(renamed).toBeDefined();
  expect(JSON.parse(renamed!.value).name).toBe('第1章 归途');
  const prefsRow = upserts.find(row => row.id === 'prefs');
  expect(prefsRow).toBeDefined();
  const prefs = JSON.parse(prefsRow!.value);
  expect(prefs).not.toHaveProperty('autoScroll');
  expect(prefs).not.toHaveProperty('punctuation');
  const readingRow = upserts.find(row => row.id === 'reading');
  expect(JSON.parse(readingRow!.value)).not.toHaveProperty('999');
  const editingRow = upserts.find(row => row.id === 'editing');
  expect(JSON.parse(editingRow!.value)).not.toHaveProperty('nope');
});

test('migrateRows 可以重复执行', () => {
  const rows = new Map<string, string>();
  const put = (id: string, value: unknown) => rows.set(id, JSON.stringify(value));
  put('schema', 1);
  put('groups', [{ id: 1, name: '待整理' }]);
  put('book-order', [1]);
  put('book:1', { id: 1, name: '雨停之后', author: '林间', group: null, tone: 'rose', image: 'data:image/png;base64,aGVsbG8=', chapterIds: ['c0'] });
  put('chapter:c0', { id: 'c0', name: '第1章\n归途', body: '正文' });
  put('reading', { '999': { chapter: 0, scroll: 0 } });
  put('editing', { nope: { scroll: 0 } });
  put('prefs', { font: 20, line: 1.8, autoScroll: true, punctuation: false });
  put('recovery', []);

  const first = migrateRows(rows);
  for (const row of first.upserts) rows.set(row.id, row.value);
  for (const id of first.deletes) rows.delete(id);
  const second = migrateRows(rows);
  expect(second.upserts).toEqual([{ id: 'schema', value: '2' }]);
  expect(second.deletes).toEqual([]);
});

test('normalizeSession 修正非法的会话', () => {
  const library = seededLibrary();
  // 书不存在：page 回到 home
  expect(normalizeSession({ tab: 'edit', page: 'editor', folder: null, book: 999, chapter: 0 }, library))
    .toEqual({ tab: 'edit', page: 'home', folder: null, book: null, chapter: 0 });
  // tab 为 read、page 为 editor：home
  expect(normalizeSession({ tab: 'read', page: 'editor', folder: null, book: 1, chapter: 0 }, library))
    .toEqual({ tab: 'read', page: 'home', folder: null, book: 1, chapter: 0 });
  // 章号越界：夹到最后一章
  expect(normalizeSession({ tab: 'edit', page: 'editor', folder: null, book: 1, chapter: 99 }, library).chapter).toBe(2);
});

test('validateLibrary 能拒绝无效数据', () => {
  const base = seededLibrary();
  validateLibrary(base);
  expect(() => validateLibrary({ ...base, books: [base.books[0], base.books[0]] })).toThrow('书籍无效或 ID 重复');
  expect(() => validateLibrary({ ...base, books: [{ ...base.books[1], group: 999 }] })).toThrow('分组引用');
  expect(() => validateLibrary({ ...base, toolbars: { top: ['nope'], bottom: [] } })).toThrow('工具栏配置');
  expect(() => validateLibrary({ ...base, prefs: { ...base.prefs, color: '#12345' } })).toThrow('颜色无效');
});

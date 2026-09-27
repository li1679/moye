import { test, expect } from './seed';
import { checkpoint, recoveryCapacity, type Library } from '../app/features/recovery/model';

function library(): Library {
  return {
    books: [{ id: 1, name: '书', author: '', group: null, chapters: [{ id: 'c1', name: '章', body: '原文' }] }],
    groups: [], recovery: [], reading: {}, editing: {}, prefs: { font: 16 }, readPrefs: { font: 16 },
    toolbars: { top: [], bottom: [] }, view: 'grid', restorePoint: null,
  } as Library;
}

test('checkpoint freezes before and after snapshots', async () => {
  const state = library();
  const before = state.books.map(book => ({ ...book, chapters: book.chapters.map(chapter => ({ ...chapter })) }));
  const after = state.books.map(book => ({ ...book, chapters: book.chapters.map(chapter => ({ ...chapter, body: '新文' })) }));
  checkpoint(state, '增量快照', before, after);
  before[0].chapters[0].body = '外部修改';
  after[0].chapters[0].body = '外部修改';
  expect(state.recovery[0].before[0].chapters[0].body).toBe('原文');
  expect(state.recovery[0].after[0].chapters[0].body).toBe('新文');
});

test('recovery capacity rejection leaves the library unchanged', async () => {
  const state = library();
  state.recovery = Array.from({ length: 50 }, (_, index) => ({
    id: String(index), label: 'record', date: new Date(0).toISOString(), before: [], after: [], reading: {}, editing: {},
  }));
  const original = JSON.stringify(state.recovery);
  expect(() => checkpoint(state, 'blocked', state.books, [])).toThrow('上限');
  expect(JSON.stringify(state.recovery)).toBe(original);
  expect(recoveryCapacity(state.recovery).count).toBe(50);
});

test('nested preference changes use the normal persistence path', async ({ page }) => {
  await page.goto('/');
  const openFontSettings = async () => {
    await page.locator('[data-action="book:1"]').click();
    await page.locator('[data-action="chapter:0"]').click();
    await page.locator('[data-action="tool:settings"]').click();
    await page.locator('[data-action="settings:字体"]').click();
  };
  await openFontSettings();
  await page.locator('[data-action="pref:font:18"]').click();
  await expect(page.locator('[data-action="pref:font:18"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.save-status')).toHaveText('已保存');
  await page.reload();
  await openFontSettings();
  await expect(page.locator('[data-action="pref:font:18"]')).toHaveAttribute('aria-pressed', 'true');
});

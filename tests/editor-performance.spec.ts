import { test, expect } from '@playwright/test';
import { ChapterHistory } from '../app/features/editor/history';
import { extractInputEdit } from '../app/features/editor/input-session';
import { countCharacters } from '../app/features/editor/text-tools';

test('input fast path extracts literal insert and delete patches', () => {
  expect(extractInputEdit('abc', { start: 1, end: 1 }, { inputType: 'insertText', data: '新' })).toEqual({ offset: 1, before: '', after: 'a新bc', inputType: 'insertText' });
  expect(extractInputEdit('abc', { start: 1, end: 1 }, { inputType: 'deleteContentBackward' })).toEqual({ offset: 0, before: 'a', after: 'bc', inputType: 'deleteContentBackward' });
  expect(extractInputEdit('abc', { start: 1, end: 2 }, { inputType: 'deleteContent' })).toEqual({ offset: 1, before: 'b', after: 'ac', inputType: 'deleteContent' });
  expect(extractInputEdit('abc', { start: 1, end: 1 }, { inputType: 'formatBold' })).toBeNull();
});

test('character count uses Unicode code points without copying text', () => {
  expect(countCharacters('a😀中')).toBe(3);
});

test('history keeps at most 100 undo operations per chapter', () => {
  const history = new ChapterHistory();
  const chapter = { id: 'long', name: '', body: '' };
  for (let index = 0; index < 101; index++) {
    const before = chapter.body;
    chapter.body += 'x';
    history.record(chapter, 'body', before, chapter.body);
  }
  let count = 0;
  while (history.apply(chapter, 'undo')) count++;
  expect(count).toBe(100);
});

type StoredEdit = { before: string; after: string };
function retained(history: ChapterHistory) {
  // Inspect actual strong references, not just the reported byte counter.
  return history as unknown as { active: Map<StoredEdit, unknown>; bytes: number; histories: Map<string, { undo: StoredEdit[]; redo: StoredEdit[] }> };
}

test('history releases capped and discarded redo edit references', () => {
  const history = new ChapterHistory();
  const chapter = { id: 'retention', name: '', body: '' };
  let first: StoredEdit | undefined;
  for (let index = 0; index < 1200; index++) {
    const after = `unique-${index}-` + String(index % 10).repeat(1000);
    history.record(chapter, 'body', chapter.body, after);
    chapter.body = after;
    if (!index) first = retained(history).active.keys().next().value;
    expect(retained(history).active.size).toBeLessThanOrEqual(100);
  }
  const state = retained(history);
  expect(state.active.has(first!)).toBe(false);
  const discarded = [...state.active.keys()];
  while (history.apply(chapter, 'undo')) { /* preserve redo until the next edit */ }
  history.record(chapter, 'body', chapter.body, 'new branch');
  chapter.body = 'new branch';
  expect(state.active.size).toBe(1);
  for (const edit of discarded) expect(state.active.has(edit)).toBe(false);
  const stacks = state.histories.get(chapter.id)!;
  expect(stacks.redo).toHaveLength(0);
  expect([...state.active.keys()]).toEqual(stacks.undo);
  expect(state.bytes).toBe([...state.active.keys()].reduce((sum, edit) => sum + 2 * (edit.before.length + edit.after.length), 0));
});

test('global budget releases redo chains and oversized edits', () => {
  const history = new ChapterHistory();
  const a = { id: 'a-budget', name: '', body: '' };
  const b = { id: 'b-budget', name: '', body: '' };
  const large = 'x'.repeat(9 * 1024 * 1024);
  history.record(a, 'body', '', large, { offset: 0, before: '', after: large });
  a.body = large;
  history.apply(a, 'undo');
  history.record(b, 'body', '', large, { offset: 0, before: '', after: large });
  b.body = large;
  expect(history.canApply(a, 'redo')).toBe(false);
  expect(retained(history).active.size).toBe(1);
  expect(retained(history).bytes).toBeLessThanOrEqual(32 * 1024 * 1024);
  const oversized = 'z'.repeat(17 * 1024 * 1024);
  history.record(b, 'body', large, oversized, { offset: 0, before: large, after: oversized });
  expect(retained(history).active.size).toBe(0);
  expect(retained(history).bytes).toBe(0);
});

test('history accepts verified hints and rejects incorrect predictions', () => {
  const history = new ChapterHistory();
  const chapter = { id: 'hint', name: '', body: '正文😀结尾' };
  const before = chapter.body;
  const actual = '正文结尾';
  history.record(chapter, 'body', before, actual, { offset: 2, before: '😀', after: '' });
  chapter.body = actual;
  history.apply(chapter, 'undo');
  expect(chapter.body).toBe(before);
  history.record(chapter, 'body', before, actual, { offset: 3, before: before[3], after: '' });
  chapter.body = actual;
  history.apply(chapter, 'undo');
  expect(chapter.body).toBe(before);
});

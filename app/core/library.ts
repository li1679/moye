import type { AppState } from './state';
import type { Book, Chapter } from '../data/schema';

// 数据小工具（第 2 批从 prototype.js 拆出）：当前书、当前章节、章节列表同步。

export const book = (state: AppState): Book | undefined =>
  state.books.find((b) => b.id === state.book);

export const chapter = (state: AppState): Chapter | undefined =>
  book(state)?.chapters[state.chapter];

// 没有选中的书/章时抛错；调用它们的动作只会在选中书的页面上触发。
export function needBook(state: AppState): Book {
  const b = book(state);
  if (!b) throw new Error('没有选中的书籍');
  return b;
}
export function needChapter(state: AppState): Chapter {
  const c = chapter(state);
  if (!c) throw new Error('没有选中的章节');
  return c;
}

// 章节列表变化后，修正当前编辑章与阅读进度指向的下标。
export function updateChapters(state: AppState, next: Chapter[], b: Book): void {
  const current = b.chapters[state.chapter];
  const progress = state.reading[b.id];
  const readingChapter: Chapter | null = progress ? b.chapters[progress.chapter] : null;
  b.chapters = next;
  state.chapter = Math.max(0, next.indexOf(current));
  if (progress) {
    const index = readingChapter ? next.indexOf(readingChapter) : -1;
    state.reading[b.id] = index >= 0 ? { ...progress, chapter: index } : { chapter: Math.min(progress.chapter, Math.max(0, next.length - 1)), scroll: 0 };
  }
}

export { nextLibraryOrder } from '../data/schema';

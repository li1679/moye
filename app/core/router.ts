import { $ } from './dom';
import type { Ctx } from './context';
import { currentBookUndo, clearBookUndo } from '../features/editor/book-undo';
import { syncReader } from '../features/native/native';
export type RouterPages = {
  editor(): void;    // 编辑页
  reader(): void;    // 阅读页
  layout(): void;    // 页面布局编辑
  chapters(): void;  // 章节列表页
  home(): void;      // 书架和"我的"
  prepare(): void;    // 每次渲染前的准备：编辑历史与拖拽排序实例的清理
};

type Snapshot = { key: string; list: string; depth: number; page: string; tab: string; book: number | null; chapter: number };

// 渲染总入口：按当前页面分派，前后各取一次快照，做页面切换动画。
// 动画只做视觉过渡，不读写任何业务状态。
export function createRouter(ctx: Ctx, pages: RouterPages) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let last: Snapshot | null = null;
  const chapterScroll = new Map<number, number>();

  function pageKey(): string {
    const state = ctx.state;
    return state.page === 'home'
      ? `home:${state.tab}:${state.folder}`
      : state.page === 'chapters'
        ? `chapters:${state.book}`
        : `${state.page}:${state.book}:${state.chapter}:${state.layout ? 1 : 0}`;
  }
  function depth(): number {
    const state = ctx.state;
    return state.page === 'home'
      ? state.folder === null ? 0 : 1
      : state.page === 'chapters'
        ? 2
        : state.layout ? 4 : 3;
  }
  function snapshot(): Snapshot {
    const state = ctx.state;
    return {
      key: pageKey(),
      list: `${state.view}:${state.batch}:${state.chapterBatch}`,
      page: state.page,
      depth: depth(),
      tab: state.tab,
      book: state.book,
      chapter: state.chapter,
    };
  }
  function animate(a: Snapshot, b: Snapshot, old: Element | null) {
    const shell = ctx.app.firstElementChild;
    if (!shell || shell === old) return;
    if (a.key === b.key) {
      if (a.list !== b.list) $('.books')?.classList.add('items-in');
      if (a.list !== b.list && !$('.books')) {
        shell.classList.add('page-in', 'page-fade');
        setTimeout(() => shell.classList.remove('page-in', 'page-fade'), 350);
      }
      return;
    }
    let dir = 'fade';
    if (b.depth !== a.depth) dir = b.depth > a.depth ? 'forward' : 'back';
    else if (a.book === b.book && a.tab === b.tab && a.chapter !== b.chapter)
      dir = b.chapter > a.chapter ? 'forward' : 'back';
    shell.classList.add('page-in', 'page-' + dir);
    setTimeout(() => shell.classList.remove('page-in', 'page-' + dir), 500);
  }

  function doRender(previous: Snapshot | null) {
    const state = ctx.state;
    const pending = currentBookUndo();
    if (pending && (state.page === 'home' || pending.bookId !== state.book)) clearBookUndo();
    ctx.dispose();
    pages.prepare();
    if (state.page === 'editor' || state.page === 'reader') {
      if (state.layout) pages.layout();
      else if (state.page === 'reader') pages.reader();
      else pages.editor();
      return;
    }
    document.documentElement.style.removeProperty('--paper');
    if (state.page === 'chapters') {
      pages.chapters();
      const bookId = state.book;
      const fromEditor = previous?.page === 'editor' && previous.book === bookId;
      requestAnimationFrame(() => {
        if (bookId !== null) window.scrollTo({ top: chapterScroll.get(bookId) ?? 0 });
        if (!fromEditor) return;
        const row = $<HTMLElement>(`[data-action="chapter:${state.chapter}"]`);
        row.classList.add('just-edited');
        const rect = row.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > innerHeight) row.scrollIntoView({ block: 'center' });
        setTimeout(() => row.classList.remove('just-edited'), 1200);
      });
      return;
    }
    pages.home();
  }

  function render() {
    const state = ctx.state;
    const before = last;
    if (before?.page === 'chapters' && before.book !== null) chapterScroll.set(before.book, window.scrollY);
    const old = ctx.app.firstElementChild;
    doRender(before);
    last = snapshot();
    syncReader(state.page === 'reader' ? state.readPrefs : null);
    if (reduce.matches) return;
    if (before) animate(before, last, old);
  }

  return { render };
}

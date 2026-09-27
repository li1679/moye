import Sortable from 'sortablejs';
import { $, $$, $maybe, esc } from '../core/dom';
import { icon, ib, toolMenu, cover } from '../kit/ui';
import { renderIcons as icons } from '../ui/icons';
import { enableChapterSwipe } from '../features/editor/chapter-swipe';
import { wordsOf, bookWords } from '../features/editor/text-tools';
import { pendingBookUndo, takeBookUndo } from '../features/editor/book-undo';
import { saveNow } from '../data/autosave';
import { updateChapters } from '../core/library';
import type { Book } from '../data/schema';
import type { ActionHandler, Ctx, PageModule } from '../core/context';

// 一键排版在 2.6 搬进编辑器模块；在那之前由组装入口把 prototype.js 里的函数传进来。
export type ChaptersHelpers = {
  confirmSheet(title: string, message: string, action: string): void;
  applyFormat(all?: boolean): Promise<void>;
};

// 打开指定下标的章节。chapter 和 jump-chapter 共用；目录跳章（2.6）也走这里。
export function openChapter(ctx: Ctx, arg?: string) {
  const state = ctx.state;
  state.chapter = Number(arg);
  if (state.page !== 'reader') state.page = 'editor';
  else if (state.book !== null) state.reading[state.book] = { chapter: state.chapter, scroll: 0 };
  ctx.closeSheet();
  ctx.render();
}

export function createChaptersPage(ctx: Ctx, helpers: ChaptersHelpers): PageModule {
  const state = ctx.state;
  let chapterSort: Sortable | null = null;

  function currentBook(): Book {
    const b = ctx.book();
    if (!b) throw new Error('没有选中的书籍');
    return b;
  }

  function render() {
    const b = currentBook();
    const managing = state.chapterBatch;
    const selected = state.selectedChapters;
    const all = b.chapters.length > 0 && b.chapters.every(c => selected.has(c));
    ctx.app.innerHTML = `<main class="app-shell chapter-page ${managing ? "chapter-managing" : ""}"><header class="topbar">${ib("chevron-left", managing ? "退出章节管理" : "返回书架", managing ? "finish-chapters" : "home")}<div class="title center"><h2>${esc(b.name)}</h2><small>${bookWords(b).toLocaleString()} 字</small></div>${managing ? `<button class="text-action" data-action="finish-chapters">完成</button>` : ib("ellipsis-vertical", "书籍菜单", "book-menu")}</header><div class="chapter-toolbar"><strong>章节</strong><small ${managing ? 'role="status" aria-live="polite"' : ""}>${managing ? `已选 ${selected.size} / ${b.chapters.length} 章` : `${b.chapters.length} 章`}</small>${managing ? "" : ib("square-check-big", "管理章节", "manage-chapters") + ib("file-plus-2", "新建章节", "new-chapter")}</div><section class="chapter-list">${b.chapters.map((c, i) => managing ? `<button class="chapter-row chapter-select-row ${selected.has(c) ? "chapter-selected" : ""}" data-chapter-index="${i}" data-chapter-handle="${i}" data-action="select-chapter:${i}" aria-pressed="${selected.has(c)}" title="点击选择，长按拖动排序">${icon(selected.has(c) ? "square-check" : "square")}<div class="chapter-info"><strong>${esc(c.name)}</strong><small>${wordsOf(c).toLocaleString()} 字</small></div></button>` : `<div class="chapter-swipe"><button class="chapter-delete" data-action="delete-chapter:${i}" aria-label="删除章节：${esc(c.name)}">删除</button><button class="chapter-row" data-action="chapter:${i}"><div class="chapter-info"><strong>${esc(c.name)}</strong><small>${wordsOf(c).toLocaleString()} 字</small></div>${icon("chevron-right")}</button></div>`).join("")}</section>${!b.chapters.length ? '<div class="empty">暂无章节</div>' : ""}${managing ? `<footer class="batch-footer chapter-batch-footer"><button data-action="select-all-chapters" ${b.chapters.length ? "" : "disabled"}>${icon(all ? "square-minus" : "square-check-big")}${all ? "取消全选" : "全选"}</button><button data-action="invert-chapters" ${b.chapters.length ? "" : "disabled"}>${icon("repeat-2")}反选</button><button data-action="delete-chapters" ${selected.size ? "" : "disabled"}>${icon("trash-2")}删除 (${selected.size})</button></footer>` : `<button class="new-chapter" data-action="new-chapter">${icon("file-plus-2")}新建章节</button>`}</main>`;
    icons();
    if (!managing) enableChapterSwipe($('.chapter-list'));
    if (managing && b.chapters.length) {
      chapterSort = new Sortable($('.chapter-list'), {
        draggable: "[data-chapter-index]",
        delay: 300,
        delayOnTouchOnly: true,
        touchStartThreshold: 6,
        animation: 150,
        forceFallback: true,
        fallbackTolerance: 5,
        ghostClass: "drag-ghost",
        onEnd() {
          updateChapters(state, $$<HTMLElement>("[data-chapter-index]").map(el => b.chapters[Number(el.dataset.chapterIndex)]), b);
          reindexChapterRows();
        },
      });
      ctx.onDispose(() => { chapterSort?.destroy(); chapterSort = null; });
    }
  }

  function reindexChapterRows() {
    $$<HTMLElement>(".chapter-list [data-chapter-index]").forEach((row, i) => {
      row.dataset.chapterIndex = String(i);
      row.dataset.chapterHandle = String(i);
      row.dataset.action = "select-chapter:" + i;
    });
    updateChapterSelection();
  }

  function updateChapterSelection() {
    const b = currentBook();
    const chapters = b.chapters, selected = state.selectedChapters;
    $$<HTMLElement>('[data-chapter-index]').forEach(row => {
      const active = selected.has(chapters[Number(row.dataset.chapterIndex)]);
      row.classList.toggle('chapter-selected', active);
      row.setAttribute('aria-pressed', String(active));
      row.querySelector('svg')?.remove();
      row.insertAdjacentHTML('afterbegin', icon(active ? 'square-check' : 'square'));
    });
    $('.chapter-toolbar small').textContent = `已选 ${selected.size} / ${chapters.length} 章`;
    const all = chapters.length > 0 && chapters.every(c => selected.has(c));
    $<HTMLButtonElement>('[data-action="select-all-chapters"]').innerHTML = icon(all ? 'square-minus' : 'square-check-big') + (all ? '取消全选' : '全选');
    const remove = $<HTMLButtonElement>('[data-action="delete-chapters"]');
    remove.disabled = !selected.size;
    remove.innerHTML = icon('trash-2') + `删除 (${selected.size})`;
    icons();
  }

  function chapterSelection(_arg?: string, _arg2?: string, _arg3?: string, raw?: string) {
    const kind = (raw ?? '').split(':')[0];
    const b = currentBook();
    const chapters = b.chapters;
    const all = chapters.every(c => state.selectedChapters.has(c));
    if (kind === "invert-chapters") {
      state.selectedChapters = new Set(chapters.filter(c => !state.selectedChapters.has(c)));
    } else {
      state.selectedChapters = new Set(all ? [] : chapters);
    }
    updateChapterSelection();
  }

  // 管理模式下，方向键在聚焦的章节行之间移动章节。
  function install() {
    document.addEventListener('keydown', (e) => {
      if (!(e.target instanceof Element)) return;
      const handle = e.target.closest<HTMLElement>('[data-chapter-handle]');
      if (!handle || !state.chapterBatch || !["ArrowUp", "ArrowDown"].includes(e.key)) return;
      e.preventDefault();
      const b = currentBook();
      const from = Number(handle.dataset.chapterHandle);
      const to = from + (e.key === "ArrowUp" ? -1 : 1);
      const next = [...b.chapters];
      if (to < 0 || to >= next.length) return;
      [next[from], next[to]] = [next[to], next[from]];
      const list = $('.chapter-list');
      const scroll = list.scrollTop;
      const sibling = list.children[to];
      list.insertBefore(handle, to < from ? sibling : sibling.nextSibling);
      updateChapters(state, next, b);
      reindexChapterRows();
      list.scrollTop = scroll;
      handle.focus({ preventScroll: true });
    });
  }

  const actions: Record<string, ActionHandler> = {
    chapters() {
      state.page = "chapters";
      ctx.closeSheet();
      ctx.render();
    },
    chapter(arg) {
      openChapter(ctx, arg);
    },
    'new-chapter'() {
      const b = currentBook();
      b.chapters.push({ id: crypto.randomUUID(), name: "第" + (b.chapters.length + 1) + "章", body: "" });
      ctx.render();
    },
    'book-menu'() {
      const b = currentBook();
      const pending = pendingBookUndo(b.id);
      ctx.openSheet(
        "书籍操作",
        toolMenu([
          ...(pending ? [["undo-2", "撤销" + pending.label, "undo-book-change"]] : []),
          ["book-open-text", "书籍详情", "details"],
          ["pencil-line", "修改信息", "edit-book"],
          ["square-check-big", "管理章节", "manage-chapters"],
          ["pilcrow", "全书排版", "format-book"],
          ["search", "本书搜索", "book-search"],
          ["file-input", "导入章节", "import"],
          ["file-output", "导出书籍", "export-book"],
          ["trash-2", "删除书籍", "delete-book", true],
        ]),
      );
    },
    details() {
      const b = currentBook();
      ctx.openSheet(
        "书籍详情",
        `<div class="cover-picker">${cover(b)}</div><h2>${esc(b.name)}</h2><p class="hint">${esc(b.author || "未署名")} · ${b.chapters.length} 章 · ${bookWords(b)} 字</p><p class="hint">${esc(b.description || "暂无简介")}</p>`,
      );
    },
    'delete-book'() {
      const b = currentBook();
      helpers.confirmSheet(
        "删除书籍",
        `删除《${b.name}》及其章节？删除后 5 秒内可以撤销。`,
        "confirm-book",
      );
    },
    'confirm-book'() {
      const b = currentBook();
      const index = state.books.indexOf(b);
      const reading = state.reading[b.id];
      const editing = Object.fromEntries(b.chapters.filter(c => state.editing[c.id]).map(c => [c.id, state.editing[c.id]]));
      state.books = state.books.filter((item) => item !== b);
      delete state.reading[b.id];
      for (const c of b.chapters) delete state.editing[c.id];
      state.page = "home";
      ctx.closeSheet();
      ctx.render();
      ctx.toast(`已删除《${b.name}》`, { label: '撤销', run: () => {
        if (state.books.includes(b)) return;
        state.books.splice(Math.min(index, state.books.length), 0, b);
        if (reading) state.reading[b.id] = reading;
        for (const [id, position] of Object.entries(editing)) state.editing[id] = position;
        ctx.render();
      } });
    },
    'manage-chapters'() {
      state.chapterBatch = true;
      state.selectedChapters.clear();
      ctx.closeSheet();
      ctx.render();
    },
    'finish-chapters'() {
      state.chapterBatch = false;
      state.selectedChapters.clear();
      ctx.render();
    },
    'select-chapter'(arg) {
      const b = currentBook();
      const c = b.chapters[Number(arg)];
      state.selectedChapters.has(c) ? state.selectedChapters.delete(c) : state.selectedChapters.add(c);
      updateChapterSelection();
    },
    'select-all-chapters': chapterSelection,
    'invert-chapters': chapterSelection,
    'delete-chapter'(arg) {
      const b = currentBook();
      const c = b.chapters[Number(arg)];
      helpers.confirmSheet('删除章节', '确定删除《' + c.name + '》？删除后 5 秒内可以撤销。', 'confirm-single-chapter:' + c.id);
      const swiped = $maybe(`[data-action="chapter:${arg}"]`)?.closest('.chapter-swipe');
      ctx.sheet.addEventListener('close', () => swiped?.classList.remove('swiped'), { once: true });
    },
    async 'confirm-single-chapter'(arg) {
      const b = currentBook();
      const c = b.chapters.find(item => item.id === arg);
      if (!c) throw new Error('章节已不存在');
      const index = b.chapters.indexOf(c);
      const position = state.editing[c.id];
      updateChapters(state, b.chapters.filter(item => item !== c), b);
      delete state.editing[c.id];
      ctx.closeSheet();
      ctx.render();
      await saveNow(state);
      ctx.toast('已删除 1 章', { label: '撤销', run: () => {
        if (b.chapters.includes(c) || !state.books.includes(b)) return;
        b.chapters.splice(Math.min(index, b.chapters.length), 0, c);
        if (position) state.editing[c.id] = position;
        ctx.render();
      } });
    },
    'delete-chapters'() {
      if (!state.selectedChapters.size) return;
      helpers.confirmSheet("删除章节", "删除选中的 " + state.selectedChapters.size + " 个章节？删除后 5 秒内可以撤销。", "confirm-chapters");
    },
    'confirm-chapters'() {
      const b = currentBook();
      const removed = b.chapters.map((c, index) => ({ c, index, position: state.editing[c.id] })).filter(({ c }) => state.selectedChapters.has(c)).sort((x, y) => x.index - y.index);
      updateChapters(state, b.chapters.filter(c => !state.selectedChapters.has(c)), b);
      for (const { c } of removed) delete state.editing[c.id];
      state.selectedChapters.clear();
      ctx.closeSheet();
      ctx.render();
      ctx.toast(`已删除 ${removed.length} 章`, { label: '撤销', run: () => {
        if (!state.books.includes(b)) return;
        for (const { c, index, position } of removed) {
          if (b.chapters.includes(c)) continue;
          b.chapters.splice(Math.min(index, b.chapters.length), 0, c);
          if (position) state.editing[c.id] = position;
        }
        ctx.render();
      } });
    },
    async 'format-book'() {
      await helpers.applyFormat(true);
    },
    async 'undo-book-change'() {
      const entry = state.book !== null ? takeBookUndo(state.book) : null;
      if (!entry) return;
      const b = currentBook();
      let skipped = 0;
      for (const change of entry.changes) {
        const c = b.chapters.find(item => item.id === change.chapterId);
        if (c && c.body === change.after) c.body = change.before;
        else skipped++;
      }
      ctx.closeSheet();
      ctx.render();
      await saveNow(state);
      ctx.toast(skipped ? `已撤销${entry.label}，${skipped} 章之后改过，没有撤销` : `已撤销${entry.label}`);
    },
    'export-book'() {
      ctx.txt.openExport(currentBook(), undefined);
    },
  };

  return { actions, render, install };
}

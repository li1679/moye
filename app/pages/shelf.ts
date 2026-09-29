import Sortable from 'sortablejs';
import { $, $$, esc } from '../core/dom';
import { icon, ib, toolMenu, cover } from '../kit/ui';
import { nextLibraryOrder } from '../data/schema';
import type { ActionHandler, Ctx, PageModule } from '../core/context';

// 表单（ui/forms.ts）与书名搜索（features/search/search-ui.ts）由组装入口注入。
export type ShelfHelpers = {
  bookForm(edit?: boolean): void;
  inputForm(title: string, label: string, action: string, value?: string): void;
  confirmSheet(title: string, message: string, action: string): void;
  searchBooks(): void;
};

// 主导航：书架页和"我的"页共用。
export function nav(tab: string) {
  return `<nav class="bottom-nav" aria-label="主导航">${([
    ['edit', 'feather', '主页'],
    ['read', 'book-open-text', '阅读'],
    ['me', 'settings', '我的'],
  ] as const)
    .map(
      ([id, i, n]) =>
        `<button class="${tab === id ? 'active' : ''}" data-action="tab:${id}">${icon(i)}<span>${n}</span></button>`,
    )
    .join('')}</nav>`;
}

export function createShelfPage(ctx: Ctx, helpers: ShelfHelpers): PageModule {
  const state = ctx.state;
  let librarySort: Sortable | null = null;

  function folderItem(g: { id: number; name: string }) {
    return `<div class="folder-item" data-library-key="folder:${g.id}">${state.batch ? `<span class="drag-handle" title="拖动文件夹排序" aria-label="拖动文件夹排序">${icon('grip-vertical')}</span>` : ''}<button class="folder-open" data-action="folder:${g.id}"><div class="cover folder-cover">${icon('folders')}</div><div class="book-info"><div class="book-name">${esc(g.name)}</div><small>${state.books.filter((b) => b.group === g.id).length} 本书</small></div></button>${state.tab === 'edit' ? ib('ellipsis-vertical', '分组菜单', 'group-menu:' + g.id) : ''}</div>`;
  }

  function libraryItems() {
    const items = [
      ...(state.folder === null ? state.groups.map(item => ({ key: 'folder:' + item.id, item, folder: true })) : []),
      ...state.books.filter(b => b.group === state.folder).map(item => ({ key: 'book:' + item.id, item, folder: false })),
    ];
    return items.sort((a, b) => (a.item.libraryOrder ?? Infinity) - (b.item.libraryOrder ?? Infinity));
  }

  function enableLibrarySort() {
    if (!state.batch) return;
    librarySort = new Sortable($('.books'), {
      draggable: '[data-library-key]',
      handle: '.drag-handle',
      animation: 150,
      forceFallback: true,
      fallbackTolerance: 5,
      ghostClass: 'drag-ghost',
      onEnd() {
        const items = new Map(libraryItems().map(entry => [entry.key, entry.item]));
        $$<HTMLElement>('.books > [data-library-key]').forEach((el, index) => {
          const item = items.get(el.dataset.libraryKey ?? '');
          if (item) item.libraryOrder = index;
        });
      },
    });
    ctx.onDispose(() => { librarySort?.destroy(); librarySort = null; });
  }

  function render() {
    const list = state.books.filter((b) => b.group === state.folder);
    const group = state.groups.find((g) => g.id === state.folder);
    ctx.app.innerHTML = `<main class="app-shell home ${group ? 'folder-page' : ''} ${state.batch ? 'library-managing' : ''}"><header class="topbar">${group ? ib('chevron-left', '返回书架', 'folder:root') : ''}<div class="title"><h1>${esc(group?.name || (state.tab === 'read' ? '阅读' : '墨页'))}</h1></div><div class="actions">${state.batch ? `<button class="text-action" data-action="batch">完成</button>` : ib('search', '搜索书籍', 'title-search') + ib('ellipsis-vertical', '书架菜单', 'home-menu')}</div></header><section class="page-body"><div class="books ${state.view === 'list' ? 'list' : ''} ${state.batch ? 'managing' : ''}">${libraryItems().map(({ item: b, folder }) => folder ? folderItem(b) : `<button class="book ${state.selected.has(b.id) ? 'selected-book' : ''}" data-action="book:${b.id}" data-book-id="${b.id}" data-library-key="book:${b.id}" aria-label="${esc(b.name)}" ${state.batch ? `aria-pressed="${state.selected.has(b.id)}"` : ''}>${state.batch ? `<span class="drag-handle" title="拖动排序" aria-label="拖动排序">${icon('grip-vertical')}</span>` : ''}${cover(b)}<div class="book-info"><div class="book-name" title="${esc(b.name)}">${esc(b.name)}</div></div></button>`).join('')}${state.tab === 'edit' && !state.batch ? `<button class="add-book" aria-label="新建书籍" title="新建书籍" data-action="new-book">${icon('plus')}</button>` : ''}</div>${!list.length && state.tab === 'read' ? '<div class="empty">暂无书籍</div>' : ''}</section>${state.batch ? `<div class="batch-footer"><button data-action="select-all">${icon('circle-check')}全选</button><button data-action="move">${icon('folder-input')}移至分组</button><button data-action="delete-books">${icon('trash-2')}删除 (${state.selected.size})</button></div>` : group ? '' : nav(state.tab)}</main>`;
    enableLibrarySort();
  }

  const actions: Record<string, ActionHandler> = {
    tab(arg) {
      state.tab = arg === 'read' || arg === 'me' ? arg : 'edit';
      state.page = 'home';
      state.folder = null;
      state.batch = false;
      ctx.render();
    },
    home() {
      state.page = 'home';
      state.readerControls = false;
      ctx.closeSheet();
      ctx.render();
    },
    view(arg) {
      state.view = arg === 'list' ? 'list' : 'grid';
      ctx.closeSheet();
      ctx.render();
    },
    folder(arg) {
      state.batch = false;
      state.selected.clear();
      state.folder = arg === 'root' ? null : Number(arg);
      ctx.render();
    },
    book(arg) {
      const id = Number(arg);
      if (state.batch) {
        state.selected.has(id)
          ? state.selected.delete(id)
          : state.selected.add(id);
        ctx.render();
        return;
      }
      state.chapterBatch = false;
      state.selectedChapters.clear();
      state.book = id;
      const progress = state.reading[id];
      const target = state.books.find(b => b.id === id);
      const savedIndex = progress?.chapterId && target ? target.chapters.findIndex(c => c.id === progress.chapterId) : progress?.chapter ?? 0;
      state.chapter = state.tab === 'read' ? Math.max(0, savedIndex) : 0;
      state.page = state.tab === 'read' ? 'reader' : 'chapters';
      state.readerControls = false;
      ctx.render();
    },
    'home-menu'() {
      const viewItem =
        state.view === 'grid'
          ? ['list', '切换为列表模式', 'view:list']
          : ['layout-grid', '切换为书架模式', 'view:grid'];
      ctx.openSheet(
        '书架',
        toolMenu(
          state.tab === 'read'
            ? [viewItem]
            : [
                ['book-plus', '新建书籍', 'new-book'],
                ...(state.folder === null ? [
                  ['file-input', '导入 TXT', 'import'],
                  ['folder-plus', '新建分组', 'new-group'],
                  ['archive', '完整备份与恢复', 'backup'],
                ] : []),
                ['square-check-big', '管理作品', 'batch'],
                ['search', '全部书籍搜索', 'global-search'],
                viewItem,
              ],
        ),
      );
    },
    'new-book'() { helpers.bookForm(false); },
    'edit-book'() { helpers.bookForm(true); },
    'choose-cover'() {
      $<HTMLInputElement>('#cover-file').click();
    },
    'new-group'() {
      helpers.inputForm('新建分组', '分组名称', 'group');
    },
    'group-menu'(arg) {
      state.activeGroup = Number(arg);
      const g = state.groups.find((item) => item.id === state.activeGroup);
      if (!g) return;
      ctx.openSheet(
        g.name,
        `<button class="row" data-action="rename-group"><span>重命名分组</span>${icon('pencil')}</button><button class="row" data-action="delete-group"><span>删除分组</span>${icon('trash-2')}</button>`,
      );
    },
    'rename-group'() {
      const g = state.groups.find((item) => item.id === state.activeGroup);
      if (!g) return;
      helpers.inputForm('重命名分组', '分组名称', 'rename-group', g.name);
    },
    'delete-group'() {
      helpers.confirmSheet('删除分组', '分组中的书籍将移回书架。', 'confirm-group');
    },
    'confirm-group'() {
      const affected = state.books.filter(b => b.group === state.activeGroup);
      const remaining = [...state.groups.filter(g => g.id !== state.activeGroup), ...state.books.filter(b => b.group === null), ...affected];
      let nextOrder = Math.max(-1, ...remaining.map(item => item.libraryOrder ?? -1)) + 1;
      state.books.forEach((b) => {
        if (affected.includes(b)) {
          b.group = null;
          b.libraryOrder = b.libraryOrder ?? nextOrder++;
        }
      });
      state.groups = state.groups.filter((g) => g.id !== state.activeGroup);
      state.folder = null;
      ctx.closeSheet();
      ctx.render();
    },
    batch() {
      state.batch = !state.batch;
      state.selected.clear();
      ctx.closeSheet();
      ctx.render();
    },
    'select-all'() {
      const ids = state.books
        .filter((b) => b.group === state.folder)
        .map((b) => b.id);
      const all = ids.every((id) => state.selected.has(id));
      ids.forEach((id) =>
        all ? state.selected.delete(id) : state.selected.add(id),
      );
      ctx.render();
    },
    move() {
      if (!state.selected.size) {
        ctx.toast('先选择书籍');
        return;
      }
      ctx.openSheet(
        '移至分组',
        `<button class="row" data-action="move-to:root"><span>书架</span>${icon('chevron-right')}</button>` +
          state.groups
            .map(
              (g) =>
                `<button class="row" data-action="move-to:${g.id}"><span>${esc(g.name)}</span>${icon('chevron-right')}</button>`,
            )
            .join(''),
      );
    },
    'move-to'(arg) {
      const target = arg === 'root' ? null : Number(arg);
      state.books.forEach((b) => {
        if (state.selected.has(b.id)) {
          b.group = target;
          b.libraryOrder = nextLibraryOrder(state, target);
        }
      });
      state.batch = false;
      state.selected.clear();
      ctx.closeSheet();
      ctx.render();
    },
    'delete-books'() {
      if (!state.selected.size) {
        ctx.toast('先选择书籍');
        return;
      }
      helpers.confirmSheet(
        '删除书籍',
        `删除选中的 ${state.selected.size} 本书？删除后 5 秒内可以撤销。`,
        'confirm-books',
      );
    },
    'confirm-books'() {
      const removed = state.books.map((b, index) => ({ b, index })).filter(({ b }) => state.selected.has(b.id));
      const positions = removed.map(({ b }) => ({ id: b.id, reading: state.reading[b.id], editing: Object.fromEntries(b.chapters.filter(c => state.editing[c.id]).map(c => [c.id, state.editing[c.id]])) }));
      state.books = state.books.filter((b) => !state.selected.has(b.id));
      for (const { b } of removed) {
        delete state.reading[b.id];
        for (const c of b.chapters) delete state.editing[c.id];
      }
      state.selected.clear();
      state.batch = false;
      ctx.closeSheet();
      ctx.render();
      const n = removed.length;
      ctx.toast(n === 1 ? `已删除《${removed[0].b.name}》` : `已删除 ${n} 本书`, { label: '撤销', run: () => {
        if (removed.every(({ b }) => state.books.includes(b))) return;
        for (const { b, index } of removed) {
          state.books.splice(Math.min(index, state.books.length), 0, b);
          const saved = positions.find(item => item.id === b.id);
          if (saved?.reading) state.reading[b.id] = saved.reading;
          for (const [id, position] of Object.entries(saved?.editing ?? {})) state.editing[id] = position;
        }
        ctx.render();
      } });
    },
    'title-search'() { helpers.searchBooks(); },
    'found-book'(arg) {
      ctx.closeSheet();
      const found = state.books.find((b) => b.id === Number(arg));
      if (!found) return;
      state.folder = found.group;
      ctx.action('book:' + arg);
    },
    'import'() { ctx.txt.openImport(); },
    backup() { ctx.backup.backup(); },
  };

  return { actions, render };
}

import { createSheets, type SheetOptions } from './ui/sheets';
import { persistState } from './data/autosave';
import { createTxtFlows } from './features/txt/flows';
import { createBackupFlows } from './features/backup/flows';
import { compressCover } from './features/covers';
import { createSettings } from './ui/settings';
import { createInitialState, type AppState } from './core/state';
import { icon, ib } from './kit/ui';
import { $, esc } from './core/dom';
import { toast, runNoticeAction } from './core/toast';
import { createCtx, type ActionHandler } from './core/context';
import { registerActions, createDispatcher } from './core/actions';
import { createRouter } from './core/router';
import { createShelfPage } from './pages/shelf';
import { createMePage } from './pages/me';
import { createChaptersPage } from './pages/chapters';
import { book as bookOf, chapter as chapterOf } from './core/library';
import { createEditorPage } from './pages/editor';
import { createReaderPage } from './pages/reader';
import { createLayoutPage } from './pages/layout';
import { createDirectory } from './features/directory';
import { createSearchUi } from './features/search/search-ui';
import { createForms } from './ui/forms';
import { installNativeHandlers } from './features/native/android';

// 组装入口（2.11 从 prototype.js 迁来）：创建 state 与 ctx，装配各页面模块并合并动作表，
// 安装全局监听，最后做首次渲染。

/* UI state hydrated from the platform's local database before first render. */
const state: AppState = await persistState(createInitialState());
const settingsModule = createSettings({ state, openSheet, icon });
const { syncPreferenceControls } = settingsModule;
const app = $('#app');
const sheet = $<HTMLDialogElement>('#sheet');
const book = () => bookOf(state);
const txtFlows = createTxtFlows({ state, openSheet, closeSheet, render: () => render(), toast });
const backupFlows = createBackupFlows({ state, openSheet, prepare: () => ctx.dispose() });
const chapter = () => chapterOf(state);
const panels = createSheets(sheet, { escape: esc, button: ib, restored() {
  const gridStatus = $('[data-action="grid"] .row-value', sheet);
  if (gridStatus) gridStatus.textContent = state.prefs.grid ? '已开启' : '已关闭';
  syncPreferenceControls();
} });
function openSheet(title: string, body: string, options: SheetOptions = {}) { panels.open(title, body, options); }
function closeSheet() { panels.close(); }
function backSheet() { panels.back(); }
const ctx = createCtx({
  state, app, sheet,
  openSheet, closeSheet, backSheet,
  toast,
  book, chapter,
  editor: { commitBody: () => {}, locateText: () => {} },
  reader: { session: () => null },
  txt: txtFlows,
  backup: backupFlows,
  settings: settingsModule,
});
// Import/restore register their cancellation guards before this listener.
sheet.addEventListener('cancel', event => {
  if (event.defaultPrevented) return;
  event.preventDefault();
  backSheet();
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !sheet.open || document.querySelector('.app-picker[open]')) return;
  event.preventDefault();
  sheet.dispatchEvent(new Event('cancel', { cancelable: true }));
}, true);
sheet.addEventListener('click', (e) => {
  if (e.target === sheet) {
    const r = sheet.getBoundingClientRect();
    if (e.clientY < r.top || e.clientX < r.left || e.clientX > r.right)
      closeSheet();
  }
});
function prepareRender() {
  if (state.page !== 'editor') editorPage.resetHistory();
}
const searchUi = createSearchUi(ctx);
registerActions(searchUi);
searchUi.install?.();
const forms = createForms(ctx);
forms.install();
const shelfPage = createShelfPage(ctx, { bookForm: forms.bookForm, inputForm: forms.inputForm, confirmSheet: forms.confirmSheet, searchBooks: searchUi.searchBooks });
const mePage = createMePage(ctx);
registerActions(shelfPage);
registerActions(mePage);
const editorPage = createEditorPage(ctx, {
  search: searchUi.search,
  searchHit: searchUi.searchHit,
  afterReplace: searchUi.afterReplace,
});
const readerPage = createReaderPage(ctx);
const layoutPage = createLayoutPage(ctx);
const chaptersPage = createChaptersPage(ctx, { confirmSheet: forms.confirmSheet, applyFormat: editorPage.applyFormat });
registerActions(chaptersPage);
chaptersPage.install?.();
registerActions(editorPage);
editorPage.install?.();
registerActions(readerPage);
readerPage.install?.();
registerActions(layoutPage);
ctx.editor = editorPage.editor;
ctx.reader = readerPage.reader;
const directoryModule = createDirectory(ctx);
registerActions(directoryModule);
directoryModule.install?.();
// 组装层自己的三个动作：关闭弹层、提示条按钮、弹层返回。
const handlers: Record<string, ActionHandler> = {
  close() {
    closeSheet();
  },
  'notice-action'() {
    runNoticeAction();
  },
  'sheet-back'() {
    sheet.dispatchEvent(new Event('cancel', { cancelable: true }));
  },
};
registerActions({ actions: handlers });
function renderHome() {
  if (state.tab === 'me') mePage.render?.();
  else shelfPage.render?.();
}
const router = createRouter(ctx, {
  editor: () => editorPage.render?.(),
  reader: () => readerPage.render?.(),
  layout: () => layoutPage.render?.(),
  chapters: () => chaptersPage.render?.(),
  home: renderHome,
  prepare: prepareRender,
});
ctx.render = router.render;
const render = () => ctx.render();
const dispatch = createDispatcher(ctx);
ctx.action = dispatch;
document.addEventListener('click', (e) => {
  if (!(e.target instanceof Element)) return;
  if (e.target.closest('.drag-handle')) return;
  const target = e.target.closest<HTMLElement>('[data-action]');
  const action = target?.dataset.action;
  if (action) {
    dispatch(action).catch(error => {
      console.error('操作未完成', error);
      toast(error instanceof Error ? error.message : String(error));
    });
  }
});

await installNativeHandlers(ctx);

render();
// 首屏之后：已有的大封面在空闲时逐本自动压缩（D-13），结果更短才替换。
const compressIdleCovers = () => {
  const queue = state.books.filter((b) => (b.image?.length ?? 0) > 300_000).slice();
  const step = () => {
    const b = queue.shift();
    if (!b?.image) return;
    // 属性窄化不会带进闭包，先把封面字符串固定到局部常量。
    const image = b.image;
    void (async () => {
      try {
        const compressed = await compressCover(await (await fetch(image)).blob());
        if (compressed.length < image.length) b.image = compressed;
      } catch { /* 无法读取的封面保持原样 */ }
      step();
    })();
  };
  step();
};
if (typeof requestIdleCallback === 'function') requestIdleCallback(compressIdleCovers);
else setTimeout(compressIdleCovers, 1500);

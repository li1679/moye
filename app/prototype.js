import { renderIcons as icons } from './ui/icons';
import { createSheets } from './ui/sheets';
import { persistState } from './data/autosave';
import { createTxtFlows } from './features/txt/flows';
import { createBackupFlows } from './features/backup/flows';
import { compressCover } from './features/covers';
import { createSettings } from './ui/settings';
import { createInitialState } from './core/state';
import { icon, ib } from './kit/ui';
import { $, esc } from './core/dom';
import { toast, runNoticeAction } from './core/toast';
import { createCtx } from './core/context';
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

/* UI state hydrated from the platform's local database before first render. */
const state = await persistState(createInitialState());
const settingsModule = createSettings({ state, openSheet, icon });
const { syncPreferenceControls } = settingsModule;
const app = $("#app"),
  sheet = $("#sheet");
const book = () => bookOf(state);
const txtFlows = createTxtFlows({ state, openSheet, closeSheet, render: () => render(), toast });
const backupFlows = createBackupFlows({ state, openSheet, prepare: () => ctx.dispose() });
const chapter = () => chapterOf(state);
const panels = createSheets(sheet, { escape: esc, button: ib, icons, restored() {
  const gridStatus = $('[data-action="grid"] .row-value', sheet);
  if (gridStatus) gridStatus.textContent = state.prefs.grid ? '已开启' : '已关闭';
  syncPreferenceControls();
} });
function openSheet(title, body, options = {}) { panels.open(title, body, options); }
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
sheet.addEventListener("click", (e) => {
  if (e.target === sheet) {
    const r = sheet.getBoundingClientRect();
    if (e.clientY < r.top || e.clientX < r.left || e.clientX > r.right)
      closeSheet();
  }
});
function prepareRender() {
  if (state.page !== "editor") editorPage.resetHistory();
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
function renderHome() {
  if (state.tab === "me") mePage.render?.();
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
function updateHistoryTools() {
  if (state.page !== 'editor' || state.layout || !chapter()) return;
  for (const direction of ['undo', 'redo']) {
    document.querySelectorAll('.editor [data-action="tool:' + direction + '"]').forEach(button => {
      button.disabled = !history.canApply(chapter(), direction);
    });
  }
}
const handlers = {
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
const dispatch = createDispatcher(ctx);
ctx.action = dispatch;
document.addEventListener("click", (e) => {
  if (e.target.closest(".drag-handle")) return;
  const target = e.target.closest("[data-action]");
  if (target) {
    dispatch(target.dataset.action).catch(error => {
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
    if (!b) return;
    void (async () => {
      try {
        const compressed = await compressCover(await (await fetch(b.image)).blob());
        if (compressed.length < b.image.length) b.image = compressed;
      } catch { /* 无法读取的封面保持原样 */ }
      step();
    })();
  };
  step();
};
if (typeof requestIdleCallback === "function") requestIdleCallback(compressIdleCovers);
else setTimeout(compressIdleCovers, 1500);

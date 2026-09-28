import { closePicker } from './features/editor/pickers';
import { renderIcons as icons } from './ui/icons';
import { createSheets } from './ui/sheets';
import { persistState, saveNow } from './data/autosave';
import { nextLibraryOrder } from './data/schema';
import { createTxtFlows } from './features/txt/flows';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { App } from '@capacitor/app';
import { createBackupFlows } from './features/backup/flows';
import { compressCover } from './features/covers';
import { createSettings } from './ui/settings';
import { createInitialState } from './core/state';
import { icon, ib, cover } from './kit/ui';
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
const shelfPage = createShelfPage(ctx, { bookForm, inputForm, confirmSheet, searchBooks: searchUi.searchBooks });
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
const chaptersPage = createChaptersPage(ctx, { confirmSheet, applyFormat: editorPage.applyFormat });
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
let formImage = null;
function bookForm(edit = false) {
  const b = edit ? book() : { name: "", author: "", description: "" };
  formImage = b.image || null;
  openSheet(
    edit ? "修改书籍信息" : "新建书籍",
    `<form id="book-form" data-edit="${edit}"><button class="cover-picker" type="button" data-action="choose-cover">${cover({ ...b, name: b.name || "书籍名称" })}<span>选择封面</span></button><input type="file" id="cover-file" accept="image/*" hidden><label class="form-field"><span>书籍名称</span><input id="book-name" required maxlength="40" placeholder="点击输入书籍名称（必填）" value="${esc(b.name)}"></label><label class="form-field"><span>作者</span><input id="book-author" maxlength="40" placeholder="点击输入作者名（可选）" value="${esc(b.author)}"></label><label class="form-field"><span>简介</span><textarea id="book-description" maxlength="600" placeholder="点击输入简介（可选）">${esc(b.description || "")}</textarea></label><div class="error" id="form-error"></div><button class="primary" type="submit">${edit ? "完成" : "创建"}</button></form>`,
  );
}
function inputForm(title, label, action, value = "") {
  openSheet(
    title,
    `<form id="simple-form" data-kind="${action}"><label class="form-field"><span>${label}</span><input id="simple-value" required maxlength="80" value="${esc(value)}" placeholder="${label}" autofocus></label><button class="primary">确定</button></form>`,
  );
}
function confirmSheet(title, message, action) {
  openSheet(
    title,
    `<p class="hint">${esc(message)}</p><div class="sheet-actions"><button class="text-action" data-action="sheet-back">取消</button><button class="primary danger" data-action="${action}">确认删除</button></div>`,
  );
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
document.addEventListener("change", async (e) => {
  const el = e.target;
  if (el.id === "cover-file" && el.files[0]) {
    const f = el.files[0];
    if (!f.type.startsWith("image/")) {
      toast("请选择图片文件");
      return;
    }
    const submit = $('#book-form button[type="submit"]');
    submit.disabled = true;   // 压缩期间提交按钮是禁用的
    try {
      formImage = await compressCover(f);
      $(".cover-picker .cover").classList.add("has-image");
      $(".cover-picker .cover").innerHTML = `<img src="${formImage}" alt="封面预览">`;
    } catch {
      toast("无法读取这张图片，请换一张");
    } finally {
      submit.disabled = false;
    }
  }
});
document.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.id === "book-form") {
    const name = $("#book-name").value.trim();
    if (!name) {
      $("#form-error").textContent = "书籍名称不能为空";
      return;
    }
    const values = {
      name,
      author: $("#book-author").value.trim(),
      description: $("#book-description").value.trim(),
      image: formImage,
    };
    if (f.dataset.edit === "true") Object.assign(book(), values);
    else
      state.books.push({
        ...values,
        id: Date.now(),
        group: state.folder,
        libraryOrder: nextLibraryOrder(state, state.folder),
        chapters: [],
      });
    closeSheet();
    render();
  }
  if (f.id === "simple-form") {
    const value = $("#simple-value").value.trim();
    if (!value) return;
    const kind = f.dataset.kind;
    if (kind === "group") state.groups.push({ id: Date.now(), name: value, libraryOrder: nextLibraryOrder(state, null) });
    if (kind === "rename-group")
      state.groups.find((g) => g.id === state.activeGroup).name = value;
    closeSheet();
    render();
  }
});

if (Capacitor.isNativePlatform()) {
  await App.addListener('backButton', async () => {
    try {
      if (document.activeElement?.matches('[contenteditable], input:not([type="range"]):not([type="color"]):not([type="checkbox"]):not([type="file"]), textarea')) {
        document.activeElement.blur();
        await Keyboard.hide();
        return;
      }
      if (closePicker()) return;
      if (sheet.open) { sheet.dispatchEvent(new Event('cancel', { cancelable: true })) && closeSheet(); return; }
      if (state.chapterBatch) { await dispatch('finish-chapters'); return; }
      if (state.batch) { await dispatch('batch'); return; }
      if (state.layout) { await dispatch('finish-layout'); return; }
      if (state.page === 'editor') { await dispatch('chapters'); return; }
      if (state.page === 'reader' || state.page === 'chapters') { await dispatch('home'); return; }
      if (state.folder !== null) { await dispatch('folder:root'); return; }
      if (state.tab !== 'edit') { await dispatch('tab:edit'); return; }
      await saveNow(state);
      await App.exitApp();
    } catch (error) { toast('返回未完成：' + String(error)); }
  });
  await App.addListener('appStateChange', async ({ isActive }) => {
    if (isActive) return;
    ctx.reader.session()?.save();
    document.dispatchEvent(new Event('visibilitychange'));
    try { await saveNow(state); }
    catch (error) { console.error('后台保存未完成', error); }
  });
}

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

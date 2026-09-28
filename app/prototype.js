import { closePicker } from './features/editor/pickers';
import { renderIcons as icons } from './ui/icons';
import { createSheets } from './ui/sheets';
import { persistState, saveNow } from './data/autosave';
import { nextLibraryOrder } from './data/schema';
import { createTxtFlows } from './features/txt/flows';
import { bookWords } from './features/editor/text-tools';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { App } from '@capacitor/app';
import { createBackupFlows } from './features/backup/flows';
import { SearchClient } from './features/editor/search-client';
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
const shelfPage = createShelfPage(ctx, { bookForm, inputForm, confirmSheet, searchBooks });
const mePage = createMePage(ctx);
registerActions(shelfPage);
registerActions(mePage);
const editorPage = createEditorPage(ctx, {
  search,
  searchHit: () => selectedMatch || currentHits[0],
  afterReplace: () => { selectedMatch = null; searchPage = 0; searchResults(); },
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
function search(scope = "book", replace = false) {
  searchPage = 0;
  selectedMatch = null;
  openSheet(
    replace
      ? "查找替换"
      : scope === "global"
        ? "全部书籍搜索"
        : scope === "chapter"
          ? "本章搜索"
          : "本书搜索",
    `<div class="search-input">${icon("search")}<input id="query" aria-label="搜索文本" placeholder="查找指定文本" data-scope="${scope}"></div>${replace ? '<label class="form-field"><span>替换为</span><input id="replacement" placeholder="留空即删除匹配文字"></label><p class="hint">点击结果选择替换位置；未选择时替换第一处。</p><div class="search-actions"><button class="text-action" data-action="replace-one">替换这一处</button><button class="text-action" data-action="replace">替换本章全部</button></div>' : ""}<div id="search-results"><div class="empty">输入要查找的文字</div></div>`,
  );
  if (replace) {
    const label = document.createElement('label');
    label.className = 'row';
    label.innerHTML = '<span>查找替换范围</span><select aria-label="替换范围"><option value="chapter">当前章</option><option value="book">整本书</option></select>';
    $('.sheet-content', sheet).prepend(label);
    label.querySelector('select').onchange = event => {
      $('#query').dataset.scope = event.target.value;
      $('[data-action="replace"]').textContent = event.target.value === 'book' ? '预览全书替换' : '替换本章全部';
      searchPage = 0;
      selectedMatch = null;
      searchResults();
    };
  }
}
function searchBooks() {
  openSheet(
    "搜索书籍",
    `<div class="search-input">${icon("search")}<input id="query" aria-label="书籍名称" placeholder="输入书名" data-scope="titles"></div><div id="search-results"><div class="empty">输入要查找的书名</div></div>`,
  );
}
let searchPage = 0, searchRevision = 0, searchTimer;
const searchClient = new SearchClient();
let currentHits = [], selectedMatch = null;
sheet.addEventListener('close', () => {
  searchRevision++;
  clearTimeout(searchTimer);
  searchClient.dispose();
});
function searchResults() {
  clearTimeout(searchTimer);
  searchClient.cancel();
  const revision = ++searchRevision;
  const q = $("#query").value;
  const scope = $("#query").dataset.scope;
  if (scope === "titles") {
    const matches = q.trim()
      ? state.books.filter((b) =>
          b.name.toLocaleLowerCase().includes(q.trim().toLocaleLowerCase()),
        )
      : [];
    $("#search-results").innerHTML = !q.trim()
      ? '<div class="empty">输入要查找的书名</div>'
      : matches.length
        ? matches
            .map(
              (b) =>
                `<button class="result" data-action="found-book:${b.id}"><strong>${esc(b.name)}</strong><small>${esc(b.author || "未署名")} · ${b.chapters.length} 章 · ${bookWords(b)} 字</small></button>`,
            )
            .join("")
        : '<div class="empty">没有找到这本书</div>';
    return;
  }
  if (!q) {
    $("#search-results").innerHTML =
      '<div class="empty">输入要查找的文字</div>';
    return;
  }
  $("#search-results").textContent = '正在查找…';
  currentHits = [];
  searchTimer = setTimeout(async () => {
    const documents = [];
    for (const b of scope === 'global' ? state.books : [book()]) {
      b.chapters.forEach((c, i) => {
        if (scope === 'chapter' && i !== state.chapter) return;
        c.id ??= crypto.randomUUID();
        documents.push({ bookId: b.id, chapterId: c.id, title: c.name, bookName: b.name, body: c.body });
      });
    }
    try {
      const { hits, total } = await searchClient.search(documents, q, searchPage);
      if (revision !== searchRevision || !$("#search-results")) return;
      currentHits = hits;
      $("#search-results").innerHTML = total
        ? `<p class="hint">共 ${total} 处匹配 · 第 ${searchPage + 1} / ${Math.ceil(total / 50)} 页</p>` +
          hits.map((hit, index) => `<button class="result" data-action="match-hit:${index}" ${$("#replacement") ? 'aria-pressed="false"' : ''}><strong>${esc(hit.title)}</strong><small>${esc(hit.bookName)}</small><p>${esc(hit.before)}<mark>${esc(hit.match)}</mark>${esc(hit.after)}</p></button>`).join('') +
          `<div class="search-actions"><button class="text-action" data-action="search-page:-1" ${searchPage === 0 ? 'disabled' : ''}>上一页</button><button class="text-action" data-action="search-page:1" ${(searchPage + 1) * 50 >= total ? 'disabled' : ''}>下一页</button></div>`
        : '<div class="empty">没有找到匹配内容</div>';
    } catch (error) {
      if (revision === searchRevision && $("#search-results") && error.name !== 'AbortError') $("#search-results").textContent = '搜索失败：' + error.message;
    }
  }, 160);
}
function openSearch(_arg, _arg2, _arg3, raw) {
  const kind = raw.split(':')[0];
  search(
    kind === "global-search"
      ? "global"
      : kind === "chapter-search"
        ? "chapter"
        : "book",
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
  'global-search': openSearch,
  'book-search': openSearch,
  'chapter-search': openSearch,
  'search-page'(arg) {
    searchPage = Math.max(0, searchPage + Number(arg));
    selectedMatch = null;
    searchResults();
  },
  'match-hit'(arg) {
    const hit = currentHits[Number(arg)];
    if (!hit) return;
    if ($("#replacement")) {
      selectedMatch = hit;
      sheet.querySelectorAll('.result').forEach(element => element.setAttribute('aria-pressed', String(element.dataset.action === 'match-hit:' + arg)));
      return;
    }
    const targetBook = state.books.find(b => b.id === hit.bookId);
    const index = targetBook?.chapters.findIndex(c => c.id === hit.chapterId);
    if (index === undefined || index < 0 || targetBook.chapters[index].body.slice(hit.offset, hit.offset + hit.match.length) !== hit.match) {
      toast('匹配内容已变化，请重新搜索');
      searchResults();
      return;
    }
    state.book = hit.bookId;
    state.chapter = index;
    state.page = state.tab === "read" ? "reader" : "editor";
    if (state.page === 'reader') state.reading[state.book] = { chapter: index, chapterId: hit.chapterId, scroll: 0 };
    closeSheet();
    render();
    requestAnimationFrame(() => ctx.editor.locateText(hit.offset, hit.match.length));
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
document.addEventListener("input", (e) => {
  const el = e.target;
  if (el.id === "query") {
    searchPage = 0;
    selectedMatch = null;
    searchResults();
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

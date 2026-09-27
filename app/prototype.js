import { closePicker } from './features/editor/pickers';
import { enableChapterSwipe } from './features/editor/chapter-swipe';
import { renderIcons as icons } from './ui/icons';
import { createSheets } from './ui/sheets';
import Sortable from "sortablejs";
import { persistState, saveNow } from './data/autosave';
import { emptyLibrary, DEFAULT_SESSION, nextLibraryOrder } from './data/schema';
import { createTxtFlows } from './features/txt/flows';
import { ChapterHistory } from './features/editor/history';
import { formatText, replaceText, wordsOf, bookWords } from './features/editor/text-tools';
import { extractInputEdit } from './features/editor/input-session';
import { createWordCountClient } from './features/editor/word-count';
import { editorText } from './features/editor/dom-text';
import { captureAnchor, restoreAnchor, captureSelection, restoreSelection } from './features/editor/positions';
import { mountReader } from './features/reader/continuous';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { App } from '@capacitor/app';
import { createBackupFlows } from './features/backup/flows';
import { SearchClient } from './features/editor/search-client';
import { rememberBookChange, currentBookUndo, pendingBookUndo, takeBookUndo, clearBookUndo } from './features/editor/book-undo';
import { compressCover } from './features/covers';
import { createSettings } from './ui/settings';
import { createInitialState } from './core/state';
import { icon, ib, toolMenu, cover } from './kit/ui';
import { $, esc } from './core/dom';
import { toast, runNoticeAction } from './core/toast';
import { createCtx } from './core/context';
import { registerActions, createDispatcher } from './core/actions';
import { createRouter } from './core/router';
import { createShelfPage } from './pages/shelf';
import { createMePage } from './pages/me';

/* UI state hydrated from the platform's local database before first render. */
const state = await persistState(createInitialState());
const { settings, gridSettings, readerSettings, syncPreferenceControls } = createSettings({ state, openSheet, icon });
const tools = {
  copy: ["copy", "拷贝正文"],
  format: ["pilcrow", "一键排版"],
  undo: ["undo-2", "撤销"],
  redo: ["redo-2", "重做"],
  directory: ["list-tree", "目录"],
  settings: ["settings", "界面设置"],
  keyboard: ["keyboard", "收起键盘"],
  find: ["text-search", "查找替换"],
  top: ["arrow-up-to-line", "滚动顶部"],
  bottom: ["arrow-down-to-line", "滚动底部"],
  previous: ["arrow-left-to-line", "上一章"],
  next: ["arrow-right-to-line", "下一章"],
};
const app = $("#app"),
  sheet = $("#sheet");
const book = () => state.books.find((b) => b.id === state.book);
const txtFlows = createTxtFlows({ state, openSheet, closeSheet, render: () => render(), toast });
const backupFlows = createBackupFlows({ state, openSheet, prepare: () => ctx.dispose() });
const chapter = () => book()?.chapters[state.chapter];
const history = new ChapterHistory();
let historyChapterId = null;
function resetHistory(id = null) {
  if (historyChapterId === id) return;
  history.clear();
  historyChapterId = id;
}
let composition = null;
let readerSession = null, disposeEditor = null;
let pendingInput = null;
let wordCountClient = null, wordCountTimer = null, wordCountRevision = 0;
function scheduleWordCount(value) {
  const revision = ++wordCountRevision;
  const target = chapter();
  const label = $("#word-value");
  clearTimeout(wordCountTimer);
  wordCountTimer = setTimeout(() => {
    wordCountClient ??= createWordCountClient();
    wordCountClient.count(value).then(result => {
      if (result !== null && revision === wordCountRevision && chapter() === target && label?.isConnected) label.textContent = result;
    }).catch(() => {
      if (revision === wordCountRevision && label?.isConnected) label.textContent = '—';
    });
  }, 200);
}
let returnFocus;
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
  editor: { commitBody, locateText },
  reader: { session: () => readerSession },
  txt: txtFlows,
  backup: backupFlows,
  settings,
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
let chapterSort;
function prepareRender() {
  if (state.page !== "editor") resetHistory();
  chapterSort?.destroy();
  chapterSort = null;
}
const shelfPage = createShelfPage(ctx, { bookForm, inputForm, confirmSheet, searchBooks });
const mePage = createMePage(ctx);
registerActions(shelfPage);
registerActions(mePage);
function renderHome() {
  if (state.tab === "me") mePage.render?.();
  else shelfPage.render?.();
}
const router = createRouter(ctx, {
  editor: renderEditor,
  chapters: renderChapters,
  home: renderHome,
  prepare: prepareRender,
});
ctx.render = router.render;
const render = () => ctx.render();
function renderChapters() {
  const b = book();
  const managing = state.chapterBatch;
  const selected = state.selectedChapters;
  const all = b.chapters.length > 0 && b.chapters.every(c => selected.has(c));
  app.innerHTML = `<main class="app-shell chapter-page ${managing ? "chapter-managing" : ""}"><header class="topbar">${ib("chevron-left", managing ? "退出章节管理" : "返回书架", managing ? "finish-chapters" : "home")}<div class="title center"><h2>${esc(b.name)}</h2><small>${bookWords(b).toLocaleString()} 字</small></div>${managing ? `<button class="text-action" data-action="finish-chapters">完成</button>` : ib("ellipsis-vertical", "书籍菜单", "book-menu")}</header><div class="chapter-toolbar"><strong>章节</strong><small ${managing ? 'role="status" aria-live="polite"' : ""}>${managing ? `已选 ${selected.size} / ${b.chapters.length} 章` : `${b.chapters.length} 章`}</small>${managing ? "" : ib("square-check-big", "管理章节", "manage-chapters") + ib("file-plus-2", "新建章节", "new-chapter")}</div><section class="chapter-list">${b.chapters.map((c, i) => managing ? `<button class="chapter-row chapter-select-row ${selected.has(c) ? "chapter-selected" : ""}" data-chapter-index="${i}" data-chapter-handle="${i}" data-action="select-chapter:${i}" aria-pressed="${selected.has(c)}" title="点击选择，长按拖动排序">${icon(selected.has(c) ? "square-check" : "square")}<div class="chapter-info"><strong>${esc(c.name)}</strong><small>${wordsOf(c).toLocaleString()} 字</small></div></button>` : `<div class="chapter-swipe"><button class="chapter-delete" data-action="delete-chapter:${i}" aria-label="删除章节：${esc(c.name)}">删除</button><button class="chapter-row" data-action="chapter:${i}"><div class="chapter-info"><strong>${esc(c.name)}</strong><small>${wordsOf(c).toLocaleString()} 字</small></div>${icon("chevron-right")}</button></div>`).join("")}</section>${!b.chapters.length ? '<div class="empty">暂无章节</div>' : ""}${managing ? `<footer class="batch-footer chapter-batch-footer"><button data-action="select-all-chapters" ${b.chapters.length ? "" : "disabled"}>${icon(all ? "square-minus" : "square-check-big")}${all ? "取消全选" : "全选"}</button><button data-action="invert-chapters" ${b.chapters.length ? "" : "disabled"}>${icon("repeat-2")}反选</button><button data-action="delete-chapters" ${selected.size ? "" : "disabled"}>${icon("trash-2")}删除 (${selected.size})</button></footer>` : `<button class="new-chapter" data-action="new-chapter">${icon("file-plus-2")}新建章节</button>`}</main>`;
  icons();
  if (!managing) enableChapterSwipe($(".chapter-list"));
  if (managing && b.chapters.length) {
    chapterSort = new Sortable($(".chapter-list"), {
      draggable: "[data-chapter-index]",
      delay: 300,
      delayOnTouchOnly: true,
      touchStartThreshold: 6,
      animation: 150,
      forceFallback: true,
      fallbackTolerance: 5,
      ghostClass: "drag-ghost",
      onEnd() {
        updateChapters(Array.from(document.querySelectorAll("[data-chapter-index]"), el => b.chapters[Number(el.dataset.chapterIndex)]));
        reindexChapterRows();
      },
    });
  }
}
function reindexChapterRows() {
  document.querySelectorAll(".chapter-list [data-chapter-index]").forEach((row, i) => {
    row.dataset.chapterIndex = String(i);
    row.dataset.chapterHandle = String(i);
    row.dataset.action = "select-chapter:" + i;
  });
  updateChapterSelection();
}
function updateChapters(next, b = book()) {
  const current = b.chapters[state.chapter];
  const progress = state.reading[b.id];
  const readingChapter = progress ? b.chapters[progress.chapter] : null;
  b.chapters = next;
  state.chapter = Math.max(0, next.indexOf(current));
  if (progress) {
    const index = next.indexOf(readingChapter);
    state.reading[b.id] = index >= 0 ? { ...progress, chapter: index } : { chapter: Math.min(progress.chapter, Math.max(0, next.length - 1)), scroll: 0 };
  }
}
function updateHistoryTools() {
  if (state.page !== 'editor' || state.layout || !chapter()) return;
  for (const direction of ['undo', 'redo']) {
    document.querySelectorAll('.editor [data-action="tool:' + direction + '"]').forEach(button => {
      button.disabled = !history.canApply(chapter(), direction);
    });
  }
}
function updateChapterSelection() {
  const chapters = book().chapters, selected = state.selectedChapters;
  document.querySelectorAll('[data-chapter-index]').forEach(row => {
    const active = selected.has(chapters[Number(row.dataset.chapterIndex)]);
    row.classList.toggle('chapter-selected', active);
    row.setAttribute('aria-pressed', String(active));
    row.querySelector('svg')?.remove();
    row.insertAdjacentHTML('afterbegin', icon(active ? 'square-check' : 'square'));
  });
  $('.chapter-toolbar small').textContent = `已选 ${selected.size} / ${chapters.length} 章`;
  const all = chapters.length > 0 && chapters.every(c => selected.has(c));
  $('[data-action="select-all-chapters"]').innerHTML = icon(all ? 'square-minus' : 'square-check-big') + (all ? '取消全选' : '全选');
  const remove = $('[data-action="delete-chapters"]');
  remove.disabled = !selected.size;
  remove.innerHTML = icon('trash-2') + `删除 (${selected.size})`;
  icons();
}
function toolbar(where) {
  return state.toolbars[where]
    .filter(Boolean)
    .map((id) => ib(tools[id][0], tools[id][1], "tool:" + id))
    .join("");
}
function applyAppearance() {
  const readingAnchor = readerSession?.capture();
  const scroll = $('.editor-scroll');
  const oldBody = $('.editor:not(.reader) .manuscript');
  const editingAnchor = oldBody?.firstChild?.nodeType === Node.TEXT_NODE && scroll ? captureAnchor(oldBody, scroll) : null;
  const p = state.page === "reader" ? state.readPrefs : state.prefs;
  const r = state.page === "reader" ? $(".reader") : document.documentElement;
  r.style.setProperty("--font-size", p.font + "px");
  r.style.setProperty("--leading", p.line);
  r.style.setProperty("--paper", p.paper);
  r.style.setProperty("--text", p.color);
  r.style.setProperty("--margin", (p.margin ?? 24) + "px");
  r.style.setProperty("--bottom", (p.bottom ?? 80) + "px");
  r.style.setProperty("--body-weight", state.page !== 'reader' && state.prefs.bold ? "600" : "400");
  if ($('.reader')) $('.reader').style.filter = `brightness(${state.readPrefs.brightness}%)`;
  const m = $(".manuscript");
  if (m) {
    m.style.fontFamily =
      state.prefs.fontFamily === "宋体" ? "SimSun,serif" : "inherit";
    m.classList.toggle("rules", state.page === "editor" && state.prefs.grid);
    const p = state.prefs;
    const width = p.thick ? 2 : 1;
    const dash =
      p.lineType === "实线"
        ? ""
        : p.lineType === "长虚线"
          ? "12 7"
          : p.lineType === "短虚线"
            ? "5 4"
            : "1 4";
    const lineHeight = parseFloat(getComputedStyle(m).lineHeight);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${lineHeight}"><path d="M0 ${lineHeight - width / 2} H1000" stroke="${p.lineColor}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ""}/></svg>`;
    m.style.setProperty(
      "--rule-image",
      `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    );
    m.style.setProperty("--rule-offset", p.near ? "-4px" : "0px");
    m.style.setProperty('--rule-height', lineHeight + 'px');
  }
  if (readingAnchor) readerSession.restore(readingAnchor);
  if (editingAnchor) restoreAnchor(oldBody, scroll, editingAnchor);
}
function renderEditor() {
  ctx.dispose();
  if (state.layout) {
    renderLayout();
    return;
  }
  const c = chapter(),
    b = book();
  const reader = state.page === "reader";
  if (!c) {
    if (reader) {
      app.innerHTML = `<main class="app-shell editor reader"><header class="topbar">${ib("chevron-left", "返回阅读书架", "home")}<div class="title">${esc(b.name)}</div></header><div class="empty">暂无章节</div></main>`;
      icons();
      return;
    }
    state.page = "chapters";
    render();
    return;
  }
  if (!reader) resetHistory(c.id ??= crypto.randomUUID());
  app.innerHTML = `<main class="app-shell editor ${reader ? "reader " + (state.readerControls ? "controls" : "") : ""}">${reader ? `<header class="topbar reader-top">${ib("chevron-left", "返回阅读书架", "home")}<div class="title"><small>${esc(b.name)}</small></div>${ib("search", "本书搜索", "book-search")}</header>` : `<header class="topbar">${ib("chevron-left", "返回目录", "chapters")}<div class="editor-tools">${toolbar("top")}</div>${ib("ellipsis-vertical", "更多工具", "editor-menu")}</header>`}<section class="editor-scroll" ${reader ? 'data-reader="true"' : ""}>${reader ? `<div class="reader-label">${esc(b.name)} · ${state.chapter + 1} / ${b.chapters.length}</div>` : '<span class="word-count">本章字数 <span id="word-value">' + wordsOf(c) + "</span></span>"}<h1 class="editor-heading" ${reader ? "" : 'contenteditable="true" role="textbox" aria-label="章节标题"'}>${esc(c.name)}</h1><div class="manuscript" ${reader ? "" : 'contenteditable="true" role="textbox" aria-label="章节正文" aria-multiline="true"'} data-placeholder="${reader ? "本章暂无正文" : "请输入正文"}">${esc(c.body)}</div></section>${reader ? `<div class="reader-progress"><button class="chapter-step" data-action="reader-step:-1" ${state.chapter === 0 ? "disabled" : ""}>${icon("chevron-left")}<span>上一章</span></button><input aria-label="本章阅读进度" type="range" min="0" max="100" value="0"><button class="chapter-step" data-action="reader-step:1" ${state.chapter === b.chapters.length - 1 ? "disabled" : ""}><span>下一章</span>${icon("chevron-right")}</button></div><div class="reader-footer"><span>${esc(c.name)}</span><span id="progress-value">0%</span></div><footer class="editor-bottom reader-bottom"><button data-action="directory">${icon("list-tree")}目录</button><button data-action="night">${nightLabel()}</button><button data-action="reader-settings">${icon("settings-2")}设置</button><button data-action="chapter-search">${icon("search")}搜索</button></footer>` : `<footer class="editor-bottom">${toolbar("bottom")}</footer>`}</main>`;
  icons();
  applyAppearance();
  updateHistoryTools();
  $(".manuscript").textContent = c.body;
  if (!reader) $(".manuscript").setAttribute('contenteditable', 'plaintext-only');
  const scroll = $(".editor-scroll");
  if (!reader) {
    c.id ??= crypto.randomUUID();
    const body = $(".manuscript"), title = $(".editor-heading");
    const previous = state.editing[c.id];
    scroll.scrollTop = previous?.scroll || 0;
    if (previous?.anchor) restoreAnchor(body, scroll, previous.anchor);
    let position = previous?.selection;
    if (position) restoreSelection(position.field === 'name' ? title : body, position);
    const capture = () => {
      const selected = captureSelection(body, 'body') || captureSelection(title, 'name');
      if (selected) position = selected;
      state.editing[c.id] = {
        scroll: scroll.scrollTop, selection: position,
        anchor: body.firstChild?.nodeType === Node.TEXT_NODE && body.childNodes.length === 1 ? captureAnchor(body, scroll) : undefined,
      };
    };
    let timer;
    const schedule = () => { clearTimeout(timer); timer = setTimeout(capture, 150); };
    scroll.addEventListener('scroll', schedule, { passive: true });
    document.addEventListener('selectionchange', schedule);
    document.addEventListener('visibilitychange', capture);
    disposeEditor = () => {
      capture(); clearTimeout(timer);
      scroll.removeEventListener('scroll', schedule);
      document.removeEventListener('selectionchange', schedule);
      document.removeEventListener('visibilitychange', capture);
    };
    ctx.onDispose(() => {
      pendingInput = null;
      clearTimeout(wordCountTimer);
      wordCountRevision++;
      wordCountClient?.dispose();
      wordCountClient = null;
    });
    ctx.onDispose(() => { disposeEditor?.(); disposeEditor = null; });
  } else {
    b.chapters.forEach(ch => ch.id ??= crypto.randomUUID());
    readerSession = mountReader(scroll, b.chapters, state.chapter, state.reading[b.id], (position, progress) => {
      state.chapter = position.chapter;
      state.reading[b.id] = position;
      $('#progress-value').textContent = progress + '%';
      $('.reader-progress input').value = progress;
      $('.reader-footer span').textContent = b.chapters[position.chapter].name;
      $('[data-action="reader-step:-1"]').disabled = position.chapter === 0;
      $('[data-action="reader-step:1"]').disabled = position.chapter === b.chapters.length - 1;
    }, toast);
    ctx.onDispose(() => { readerSession?.destroy(); readerSession = null; });
    applyAppearance();
  }
}
function layoutSettings() {
  state.layoutScroll = $(".editor-scroll")?.scrollTop || 0;
  state.layout = true;
  closeSheet();
  ctx.render();
}
function layoutToolbar(where) {
  return `<div class="layout-slots" aria-label="${where === "top" ? "上方" : "下方"}工具栏">${state.toolbars[where].map((id, index) => `<div class="layout-slot">${ib(id ? tools[id][0] : "circle-plus", id ? `更换${tools[id][1]}` : `添加${where === "top" ? "上方" : "下方"}第${index + 1}个工具`, `slot:${where}:${index}`)}${id ? `<button class="slot-remove" aria-label="移除${tools[id][1]}" title="移除${tools[id][1]}" data-action="remove-tool:${where}:${index}">${icon("circle-minus")}</button>` : ""}</div>`).join("")}${ib("plus", "增加工具位置", `add-slot:${where}`)}</div>`;
}
function renderLayout() {
  app.innerHTML = `<main class="app-shell editor layout-editor"><header class="layout-header">${ib("chevron-left", "完成布局", "finish-layout")}<span>页面布局</span><button class="text-action" data-action="reset-layout">重置</button><button class="text-action" data-action="finish-layout">完成</button></header><div class="layout-top">${layoutToolbar("top")}</div><div class="layout-blank" aria-label="正文预留区域"></div><div class="layout-bottom">${layoutToolbar("bottom")}</div></main>`;
  icons();
}
function slotPicker(where, index) {
  state.activeSlot = { where, index };
  const current = state.toolbars[where][index];
  openSheet(
    "选择工具",
    `<div class="tool-grid">${Object.entries(tools)
      .map(
        ([id, [i, n]]) =>
          `<button class="tool-item ${current === id ? "chosen-tool" : ""}" data-action="choose-tool:${id}"><span class="tool-bubble">${icon(i)}</span><span>${n}</span>${current === id ? "<small>当前位置</small>" : ""}</button>`,
      )
      .join("")}</div>`,
    { className: "tool-picker" },
  );
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
function nightLabel() {
  return (state.readPrefs.night ?? state.readPrefs.paper === "#202123")
    ? `${icon("sun")}日间`
    : `${icon("moon")}夜间`;
}
function directory(reverse = false) {
  state.directoryReverse = reverse;
  const chapters = book().chapters.map((c, i) => ({ c, i }));
  if (reverse) chapters.reverse();
  openSheet(
    "目录",
    chapters
      .map(
        ({ c, i }) =>
          `<button class="chapter-row" data-action="jump-chapter:${i}"><div class="chapter-info"><strong ${i === state.chapter ? 'style="color:var(--accent)"' : ""}>${esc(c.name)}</strong><small>${wordsOf(c)} 字</small></div>${i === state.chapter ? icon("check") : ""}</button>`,
      )
      .join(""),
    {
      className: "directory-sheet",
      header: `<h2>目录</h2><button class="text-action" data-action="directory-sort">${icon("arrow-up-down")}${reverse ? "正序" : "倒序"}</button>`,
    },
  );
  $(".sheet-content", sheet).scrollTop = 0;
}
function manageChapters() {
  state.chapterBatch = true;
  state.selectedChapters.clear();
  closeSheet();
  render();
}
function commitBody(value, target = chapter()) {
  if (state.page === 'editor' && target === chapter()) history.record(target, 'body', target.body, value);
  target.body = value;
  updateHistoryTools();
  if (target !== chapter()) return;
  const m = $(".manuscript");
  if (m) m.textContent = value;
  scheduleWordCount(value);
}
function locateText(offset, length = 0, selector = '.manuscript') {
  const element = state.page === 'reader' && selector === '.manuscript' ? readerSession?.body() : $(selector);
  if (!element?.firstChild) return;
  // Called after render or explicit command; the editor has one canonical text node.
  const node = element.firstChild;
  if (node.nodeType !== Node.TEXT_NODE) return;
  const range = document.createRange();
  range.setStart(node, Math.min(offset, node.textContent.length));
  range.setEnd(node, Math.min(offset + length, node.textContent.length));
  if (state.page === 'editor') element.focus({ preventScroll: true });
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  if (globalThis.CSS?.highlights && globalThis.Highlight) {
    CSS.highlights.clear();
    if (length) CSS.highlights.set('search-match', new Highlight(range));
  }
  const scroll = $('.editor-scroll');
  if (scroll) scroll.scrollTop += range.getBoundingClientRect().top - scroll.getBoundingClientRect().top - scroll.clientHeight / 3;
}

let pendingFormat = null, pendingReplace = null;
async function applyFormat(all = false) {
  const targets = all ? book().chapters : [chapter()];
  pendingFormat = targets.map(c => ({ chapter: c, before: c.body, after: formatText(c.body, state.prefs) })).filter(change => change.before !== change.after);
  if (!pendingFormat.length) { closeSheet(); return; }
  await dispatch('apply-format:' + (all ? 'book' : 'chapter'));
}
function openChapter(arg) {
  state.chapter = Number(arg);
  if (state.page !== "reader") state.page = "editor";
  else state.reading[state.book] = { chapter: state.chapter, scroll: 0 };
  closeSheet();
  render();
}
function chapterSelection(_arg, _arg2, _arg3, raw) {
  const kind = raw.split(':')[0];
  const chapters = book().chapters;
  const all = chapters.every(c => state.selectedChapters.has(c));
  if (kind === "invert-chapters") {
    state.selectedChapters = new Set(chapters.filter(c => !state.selectedChapters.has(c)));
  } else {
    state.selectedChapters = new Set(all ? [] : chapters);
  }
  updateChapterSelection();
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
async function applyReplace(_arg, _arg2, _arg3, raw) {
  const kind = raw.split(':')[0];
  const q = $("#query").value;
  if (!q) {
    toast("先输入查找文本");
    return;
  }
  const targets = $('#query').dataset.scope === 'book' ? book().chapters : [chapter()];
  const hit = selectedMatch || currentHits[0];
  const target = kind === 'replace-one' ? targets.find(c => c.id === hit?.chapterId) : chapter();
  if (kind === 'replace' && $('#query').dataset.scope === 'book') {
    const replacement = $("#replacement").value;
    pendingReplace = targets.filter(c => c.body.includes(q)).map(c => ({ chapter: c, before: c.body, after: replaceText(c.body, q, replacement) })).filter(change => change.before !== change.after);
    if (!pendingReplace.length) { toast('没有需要替换的内容'); return; }
    const total = pendingReplace.reduce((sum, change) => sum + change.before.split(q).length - 1, 0);
    openSheet('全书替换确认', `<p class="hint">将修改 ${pendingReplace.length} 章、${total} 处匹配。离开这本书之前，可以在书籍菜单里撤销。</p><div class="setting-label">查找文字</div><pre class="text-preview">${esc(q)}</pre><div class="setting-label">替换为</div><pre class="text-preview">${esc(replacement || '（删除匹配文字）')}</pre><button class="primary" data-action="confirm-book-replace">确认全书替换</button>`);
    return;
  }
  if (!target?.body.includes(q)) {
    toast("没有匹配文本，请等待搜索完成");
    return;
  }
  const offset = kind === 'replace-one' ? hit.offset : undefined;
  const nextText = replaceText(target.body, q, $("#replacement").value, offset);
  commitBody(nextText, target);
  selectedMatch = null;
  searchPage = 0;
  searchResults();
  await saveNow(state);
  toast(kind === 'replace-one' ? '已替换这一处，可撤销' : '已替换本章全部匹配，可撤销');
}
function exportText(_arg, _arg2, _arg3, raw) {
  const kind = raw.split(':')[0];
  txtFlows.openExport(book(), kind === "export-book" ? undefined : chapter());
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
  chapters() {
    state.page = "chapters";
    closeSheet();
    render();
  },
  chapter: openChapter,
  'jump-chapter': openChapter,
  'new-chapter'() {
    book().chapters.push({name: "第" + (book().chapters.length + 1) + "章", body: ""});
    render();
  },
  'book-menu'() {
    const pending = pendingBookUndo(state.book);
    openSheet(
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
    const b = book();
    openSheet(
      "书籍详情",
      `<div class="cover-picker">${cover(b)}</div><h2>${esc(b.name)}</h2><p class="hint">${esc(b.author || "未署名")} · ${b.chapters.length} 章 · ${bookWords(b)} 字</p><p class="hint">${esc(b.description || "暂无简介")}</p>`,
    );
  },
  'delete-book'() {
    confirmSheet(
      "删除书籍",
      `删除《${book().name}》及其章节？删除后 5 秒内可以撤销。`,
      "confirm-book",
    );
  },
  'confirm-book'() {
    const b = book();
    const index = state.books.indexOf(b);
    const reading = state.reading[b.id];
    const editing = Object.fromEntries(b.chapters.filter(c => state.editing[c.id]).map(c => [c.id, state.editing[c.id]]));
    state.books = state.books.filter((item) => item !== b);
    delete state.reading[b.id];
    for (const c of b.chapters) delete state.editing[c.id];
    state.page = "home";
    closeSheet();
    render();
    toast(`已删除《${b.name}》`, { label: '撤销', run: () => {
      if (state.books.includes(b)) return;
      state.books.splice(Math.min(index, state.books.length), 0, b);
      if (reading) state.reading[b.id] = reading;
      for (const [id, position] of Object.entries(editing)) state.editing[id] = position;
      render();
    } });
  },
  'manage-chapters'() {
    manageChapters();
  },
  'finish-chapters'() {
    state.chapterBatch = false;
    state.selectedChapters.clear();
    render();
  },
  'select-chapter'(arg) {
    const c = book().chapters[Number(arg)];
    state.selectedChapters.has(c) ? state.selectedChapters.delete(c) : state.selectedChapters.add(c);
    updateChapterSelection();
  },
  'select-all-chapters': chapterSelection,
  'invert-chapters': chapterSelection,
  'delete-chapter'(arg) {
    const c = book().chapters[Number(arg)];
    confirmSheet('删除章节', '确定删除《' + c.name + '》？删除后 5 秒内可以撤销。', 'confirm-single-chapter:' + c.id);
    returnFocus = $('[data-action="chapter:' + arg + '"]');
    const swiped = returnFocus?.closest('.chapter-swipe');
    sheet.addEventListener('close', () => swiped?.classList.remove('swiped'), { once: true });
  },
  async 'confirm-single-chapter'(arg) {
    const b = book();
    const c = b.chapters.find(item => item.id === arg);
    if (!c) throw new Error('章节已不存在');
    const index = b.chapters.indexOf(c);
    const position = state.editing[c.id];
    updateChapters(b.chapters.filter(item => item !== c), b);
    delete state.editing[c.id];
    closeSheet();
    render();
    await saveNow(state);
    toast('已删除 1 章', { label: '撤销', run: () => {
      if (b.chapters.includes(c) || !state.books.includes(b)) return;
      b.chapters.splice(Math.min(index, b.chapters.length), 0, c);
      if (position) state.editing[c.id] = position;
      render();
    } });
  },
  'delete-chapters'() {
    if (!state.selectedChapters.size) return;
    confirmSheet("删除章节", "删除选中的 " + state.selectedChapters.size + " 个章节？删除后 5 秒内可以撤销。", "confirm-chapters");
  },
  'confirm-chapters'() {
    const b = book();
    const removed = b.chapters.map((c, index) => ({ c, index, position: state.editing[c.id] })).filter(({ c }) => state.selectedChapters.has(c)).sort((x, y) => x.index - y.index);
    updateChapters(b.chapters.filter(c => !state.selectedChapters.has(c)), b);
    for (const { c } of removed) delete state.editing[c.id];
    state.selectedChapters.clear();
    closeSheet();
    render();
    toast(`已删除 ${removed.length} 章`, { label: '撤销', run: () => {
      if (!state.books.includes(b)) return;
      for (const { c, index, position } of removed) {
        if (b.chapters.includes(c)) continue;
        b.chapters.splice(Math.min(index, b.chapters.length), 0, c);
        if (position) state.editing[c.id] = position;
      }
      render();
    } });
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
    requestAnimationFrame(() => locateText(hit.offset, hit.match.length));
  },
  settings(arg) {
    settings(arg);
  },
  grid() {
    gridSettings();
  },
  line(arg) {
    state.prefs.lineType = arg;
    applyAppearance();
    document.querySelectorAll('#sheet [data-action^="line:"]').forEach(button => {
      const selected = button.dataset.action === 'line:' + arg;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  },
  layout() {
    layoutSettings();
  },
  'reset-layout'() {
    state.toolbars = {
      top: ["copy", "format", "undo", "redo", "directory", "settings"],
      bottom: ["keyboard", "find", "top", "bottom", null, null],
    };
    closeSheet();
    ctx.render();
  },
  'finish-layout'() {
    state.layout = false;
    closeSheet();
    ctx.render();
    $(".editor-scroll").scrollTop = state.layoutScroll;
  },
  slot(arg, arg2) {
    slotPicker(arg, Number(arg2));
  },
  'remove-tool'(arg, arg2) {
    state.toolbars[arg][Number(arg2)] = null;
    ctx.render();
  },
  'add-slot'(arg) {
    state.toolbars[arg].push(null);
    ctx.render();
    slotPicker(arg, state.toolbars[arg].length - 1);
  },
  'choose-tool'(arg) {
    const { where, index } = state.activeSlot;
    for (const side of ["top", "bottom"])
      state.toolbars[side] = state.toolbars[side].map((id) =>
        id === arg ? null : id,
      );
    state.toolbars[where][index] = arg;
    closeSheet();
    ctx.render();
  },
  pref(arg, arg2) {
    let value = /^\d+(\.\d+)?$/.test(arg2) ? Number(arg2) : arg2;
    if (arg.startsWith("read")) {
      state.readPrefs[arg.slice(4)] = value;
      applyAppearance();
      // Keep the live controls, focus and panel scroll position intact.
      document.querySelectorAll('#sheet [data-action^="pref:' + arg + '"]').forEach(button => {
        button.classList.toggle('selected', button.dataset.action === 'pref:' + arg + ':' + arg2);
      });
      const custom = document.querySelector('#sheet [data-color="' + arg + '"]');
      if (custom) custom.value = value;
      return;
    }
    state.prefs[arg] = value;
    applyAppearance();
    syncPreferenceControls();
  },
  'theme-dark'() {
    state.prefs.paper = "#232527";
    state.prefs.color = "#dedede";
    applyAppearance();
    syncPreferenceControls();
  },
  'theme-light'(arg) {
    state.prefs.paper = arg;
    state.prefs.color = "#292d30";
    applyAppearance();
    syncPreferenceControls();
  },
  'editor-menu'() {
    openSheet(
      "更多工具",
      toolMenu([
        ["search", "本章搜索", "chapter-search"],
        ["file-output", "导出文档", "export"],
        ["sliders-horizontal", "页面布局", "layout"],
        ["list-minus", "网格线", "grid"],
      ]),
    );
  },
  directory() {
    directory();
  },
  async tool(arg) {
    if (arg === "settings") {
      settings();
      return;
    }
    if (arg === "directory") {
      directory();
      return;
    }
    if (arg === "find") {
      search("chapter", true);
      return;
    }
    closeSheet();
    if (arg === "top" || arg === "bottom") {
      $(".editor-scroll").scrollTo({
        top: arg === "top" ? 0 : $(".editor-scroll").scrollHeight,
        behavior: "smooth",
      });
      return;
    }
    if (arg === "keyboard") {
      document.activeElement.blur();
      if (Capacitor.isNativePlatform()) await Keyboard.hide();
      return;
    }
    if (arg === "copy") {
      try {
        await navigator.clipboard.writeText(chapter().body);
        toast("已复制本章正文");
      } catch {
        toast("浏览器未允许剪贴板访问");
      }
      return;
    }
    if (arg === "undo" || arg === "redo") {
      const edit = history.apply(chapter(), arg);
      if (!edit) {
        toast(arg === "undo" ? "没有可撤销的操作" : "没有可重做的操作");
        return;
      }
      $(".manuscript").textContent = chapter().body;
      $(".editor-heading").textContent = chapter().name;
      scheduleWordCount(chapter().body);
      updateHistoryTools();
      if (document.activeElement?.matches('.manuscript[contenteditable], .editor-heading[contenteditable]')) {
        locateText(edit.offset, 0, edit.field === 'body' ? '.manuscript' : '.editor-heading');
      }
      return;
    }
    if (arg === "format") {
      await applyFormat(false);
      return;
    }
    if (arg === "previous" || arg === "next") {
      const next = state.chapter + (arg === "next" ? 1 : -1);
      if (next < 0 || next >= book().chapters.length) {
        toast(arg === "next" ? "已经是最后一章" : "已经是第一章");
        return;
      }
      ctx.dispose();
      state.chapter = next;
      render();
      return;
    }
  },
  replace: applyReplace,
  'replace-one': applyReplace,
  async 'confirm-book-replace'() {
    const changes = pendingReplace;
    if (!changes?.length) return;
    if (changes.some(change => change.chapter.body !== change.before)) throw new Error('正文已变化，请重新预览替换');
    for (const change of changes) commitBody(change.after, change.chapter);
    rememberBookChange({ bookId: state.book, label: '全书替换', changes: changes.map(({ chapter, before, after }) => ({ chapterId: chapter.id, before, after })) });
    pendingReplace = null;
    closeSheet();
    await saveNow(state);
    toast('全书替换已保存');
  },
  export: exportText,
  'export-book': exportText,
  async 'format-book'() {
    await applyFormat(true);
  },
  async 'apply-format'(arg) {
    const changes = pendingFormat;
    if (!changes?.length) return;
    if (changes.some(change => change.chapter.body !== change.before)) throw new Error('正文已变化，请重新预览排版');
    for (const change of changes) commitBody(change.after, change.chapter);
    if (arg === 'book') rememberBookChange({ bookId: state.book, label: '全书排版', changes: changes.map(({ chapter, before, after }) => ({ chapterId: chapter.id, before, after })) });
    pendingFormat = null;
    closeSheet();
    render();
    await saveNow(state);
  },
  async 'undo-book-change'() {
    const entry = takeBookUndo(state.book);
    if (!entry) return;
    const b = book();
    let skipped = 0;
    for (const change of entry.changes) {
      const c = b.chapters.find(item => item.id === change.chapterId);
      if (c && c.body === change.after) c.body = change.before;
      else skipped++;
    }
    closeSheet();
    render();
    await saveNow(state);
    toast(skipped ? `已撤销${entry.label}，${skipped} 章之后改过，没有撤销` : `已撤销${entry.label}`);
  },
  'reader-settings'() {
    readerSettings();
  },
  night() {
    const p = state.readPrefs;
    const dark = p.night ?? p.paper === '#202123';
    const themes = p.themes || { day: { paper: '#ffffff', color: '#292d30' }, night: { paper: '#202123', color: '#dedede' } };
    themes[dark ? 'night' : 'day'] = { paper: p.paper, color: p.color };
    p.themes = themes;
    p.night = !dark;
    Object.assign(p, themes[dark ? 'day' : 'night']);
    applyAppearance();
    $('[data-action="night"]').innerHTML = nightLabel();
    icons();
  },
  'directory-sort'() {
    directory(!state.directoryReverse);
  },
  'reader-step'(arg) {
    const target = state.chapter + Number(arg);
    if (target < 0 || target >= book().chapters.length) return;
    readerSession?.jump(target);
  },
};
registerActions({ actions: handlers });
const dispatch = createDispatcher(ctx);
ctx.action = dispatch;
let readingPointer = null;
document.addEventListener('pointerdown', event => {
  readingPointer = event.target.closest('[data-reader]') ? { x: event.clientX, y: event.clientY, time: performance.now(), scroll: $('.editor-scroll').scrollTop } : null;
}, { passive: true });
document.addEventListener('pointerdown', event => {
  if (event.pointerType === 'mouse' && event.target.closest('.editor:not(.reader) .editor-tools, .editor:not(.reader) .editor-bottom')) event.preventDefault();
});
function isReadingTap(event) {
  if (!readingPointer || performance.now() - readingPointer.time > 500 || Math.hypot(event.clientX - readingPointer.x, event.clientY - readingPointer.y) > 10) return false;
  const scroll = $('.editor-scroll');
  if (Math.abs(scroll.scrollTop - readingPointer.scroll) > 5 || !getSelection()?.isCollapsed) return false;
  const rect = scroll.getBoundingClientRect();
  return event.clientY > rect.top + rect.height * .2 && event.clientY < rect.bottom - rect.height * .2;
}
document.addEventListener("click", (e) => {
  if (e.target.closest(".drag-handle")) return;
  const target = e.target.closest("[data-action]");
  if (target) {
    dispatch(target.dataset.action).catch(error => {
      console.error('操作未完成', error);
      toast(error instanceof Error ? error.message : String(error));
    });
    return;
  }
  if (state.page === "reader" && e.target.closest("[data-reader]") && isReadingTap(e)) {
    state.readerControls = !state.readerControls;
    $(".reader").classList.toggle("controls", state.readerControls);
  }
});
function finishComposition() {
  if (!composition) return;
  const { target, field, before } = composition;
  history.record(target, field, before, target[field]);
  composition = null;
  updateHistoryTools();
}
document.addEventListener('compositionstart', event => {
  pendingInput = null;
  const field = event.target.matches('.manuscript[contenteditable]') ? 'body' : event.target.matches('.editor-heading[contenteditable]') ? 'name' : null;
  if (field) composition = { target: chapter(), field, before: chapter()[field] };
});
document.addEventListener('compositionend', finishComposition);
document.addEventListener('focusout', event => {
  if (event.target.matches('.manuscript, .editor-heading')) finishComposition();
});
document.addEventListener('keydown', event => {
  if (event.isComposing || !event.target.matches('.manuscript[contenteditable], .editor-heading[contenteditable]') || !(event.ctrlKey || event.metaKey)) return;
  const key = event.key.toLowerCase();
  if (key !== 'z' && key !== 'y') return;
  event.preventDefault();
  const redo = key === 'y' || event.shiftKey;
  dispatch('tool:' + (redo ? 'redo' : 'undo')).catch(error => toast(String(error)));
});
document.addEventListener('pointerdown', event => {
  if (event.target.closest('[data-action="tool:undo"], [data-action="tool:redo"]')) event.preventDefault();
});
document.addEventListener('beforeinput', event => {
  pendingInput = null;
  const element = event.target;
  if (!element.matches('.manuscript[contenteditable], .editor-heading[contenteditable]')) return;
  if (['historyUndo', 'historyRedo'].includes(event.inputType)) {
    event.preventDefault();
    dispatch('tool:' + (event.inputType === 'historyUndo' ? 'undo' : 'redo')).catch(error => toast(String(error)));
    return;
  }
  if (composition || event.isComposing) return;
  const target = chapter();
  const field = element.matches('.manuscript') ? 'body' : 'name';
  const before = target[field];
  const selection = captureSelection(element, field);
  const edit = selection && extractInputEdit(before, selection, event);
  if (edit) pendingInput = { element, target, field, before, edit };
});
document.addEventListener("input", (e) => {
  const el = e.target;
  const pending = pendingInput;
  pendingInput = null;
  if (el.matches('.manuscript[contenteditable], .editor-heading[contenteditable]')) {
    const target = chapter();
    const field = el.matches('.manuscript') ? 'body' : 'name';
    const before = target[field];
    const value = editorText(el);
    let hint;
    if (pending?.element === el && pending.target === target && pending.field === field && pending.before === before && pending.edit.after === value) {
      const { offset, before: removed } = pending.edit;
      const insertedLength = value.length - before.length + removed.length;
      hint = { offset, before: removed, after: value.slice(offset, offset + insertedLength) };
    }
    if (!composition) history.record(target, field, before, value, hint);
    target[field] = value;
    if (field === 'body') scheduleWordCount(value);
    updateHistoryTools();
  }
  if (el.id === "query") {
    searchPage = 0;
    selectedMatch = null;
    searchResults();
  }
  if (el.dataset.color) {
    const key = el.dataset.color;
    if (key.startsWith("read")) state.readPrefs[key.slice(4)] = el.value;
    else state.prefs[key] = el.value;
    applyAppearance();
  }
  if (el.dataset.readerPref) {
    state.readPrefs[el.dataset.readerPref] = Number(el.value);
    $(".reader").style.filter = `brightness(${el.value}%)`;
  }
  if (el.matches(".reader-progress input")) {
    readerSession?.jump(state.chapter, Number(el.value));
  }
});
document.addEventListener("change", async (e) => {
  const el = e.target;
  if (el.dataset.pref) {
    state.prefs[el.dataset.pref] = el.checked;
    applyAppearance();
  }
  if (el.id === "font-family") {
    state.prefs.fontFamily = el.value;
    applyAppearance();
  }
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
document.addEventListener("keydown", (e) => {
  const handle = e.target.closest("[data-chapter-handle]");
  if (!handle || !state.chapterBatch || !["ArrowUp", "ArrowDown"].includes(e.key)) return;
  e.preventDefault();
  const from = Number(handle.dataset.chapterHandle);
  const to = from + (e.key === "ArrowUp" ? -1 : 1);
  const next = [...book().chapters];
  if (to < 0 || to >= next.length) return;
  [next[from], next[to]] = [next[to], next[from]];
  const list = $('.chapter-list');
  const scroll = list.scrollTop;
  const sibling = list.children[to];
  list.insertBefore(handle, to < from ? sibling : sibling.nextSibling);
  updateChapters(next);
  reindexChapterRows();
  list.scrollTop = scroll;
  handle.focus({ preventScroll: true });
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
    readerSession?.save();
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

import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { $, $$, esc } from '../core/dom';
import { ib, toolMenu, tools } from '../kit/ui';
import { onLongPress } from '../kit/long-press';
import { attachFastScroll } from '../kit/fast-scroll';
import { ChapterHistory, type HistoryHint } from '../features/editor/history';
import { formatText, replaceText, wordsOf } from '../features/editor/text-tools';
import { extractInputEdit, type InputEdit } from '../features/editor/input-session';
import { createWordCountClient, type WordCountClient } from '../features/editor/word-count';
import { editorText, editorTextPoint } from '../features/editor/dom-text';
import { captureAnchor, restoreAnchor, captureSelection, restoreSelection } from '../features/editor/positions';
import { rememberBookChange } from '../features/editor/book-undo';
import { saveNow } from '../data/autosave';
import { applyAppearance } from '../features/appearance';
import { openDirectory } from '../features/directory';
import { needBook, needChapter } from '../core/library';
import type { Chapter, Prefs, ToolId } from '../data/schema';
import { presets } from '../ui/settings';
import type { ActionHandler, Ctx, PageModule } from '../core/context';

// 2.9 搬走的部分由组装入口注入：搜索面板。
export type EditorHelpers = {
  search(scope?: string, replace?: boolean, initial?: string): void;
  searchHit(): { chapterId: string; offset: number } | null;
  afterReplace(): void;
};

export type EditorModule = PageModule & {
  editor: Ctx['editor'];
  resetHistory(id?: string | null): void;
  applyFormat(all?: boolean): Promise<void>;
};

type PendingChange = { chapter: Chapter; before: string; after: string };
type PendingInput = { element: Element; target: Chapter; field: 'body' | 'name'; before: string; edit: InputEdit };
type Composition = { target: Chapter; field: 'body' | 'name'; before: string };

export function createEditorPage(ctx: Ctx, helpers: EditorHelpers): EditorModule {

// 设置面板的键名来自模板字符串：数值/颜色/文本键写 string | number，开关键写 boolean。
function setPanelValue(target: object, key: string, value: string | number | boolean): void {
  Object.assign(target, { [key]: value });
}

// 网格线类型的四个按钮值；其他值视为无效动作忽略。
const LINE_TYPES: readonly Prefs['lineType'][] = ['实线', '长虚线', '短虚线', '点线'];
function isLineType(value: string): value is Prefs['lineType'] {
  return LINE_TYPES.includes(value as Prefs['lineType']);
}
  const state = ctx.state;
  const history = new ChapterHistory();
  let historyChapterId: string | null = null;
  let composition: Composition | null = null;
  let disposeEditor: (() => void) | null = null;
  let pendingInput: PendingInput | null = null;
  let wordCountClient: WordCountClient | null = null;
  let wordCountTimer: ReturnType<typeof setTimeout> | undefined;
  let wordCountRevision = 0;
  let pendingFormat: PendingChange[] | null = null;
  let pendingReplace: PendingChange[] | null = null;
  let findTimer: ReturnType<typeof setTimeout> | undefined;
  let findOffsets: number[] = [];
  let findIndex = -1;
  let findStartOffset = 0;
  let lastFindQuery = '';

  function installToolbarInteractions() {
    const bars = $$<HTMLElement>('.editor-tools, .editor-bottom', ctx.app);
    const updateOverflow = (bar: HTMLElement) => {
      const overflowing = bar.scrollWidth > bar.clientWidth;
      bar.classList.toggle('overflowing', overflowing);
      bar.classList.toggle('at-end', overflowing && bar.scrollLeft + bar.clientWidth >= bar.scrollWidth - 1);
    };
    const listeners = bars.map(bar => {
      const update = () => updateOverflow(bar);
      bar.addEventListener('scroll', update, { passive: true });
      update();
      return () => bar.removeEventListener('scroll', update);
    });
    const resize = () => bars.forEach(updateOverflow);
    window.addEventListener('resize', resize);
    const stopLongPress = onLongPress(ctx.app, '.editor-tools .icon, .editor-bottom .icon', button => {
      const label = button.getAttribute('aria-label');
      if (label) ctx.toast(label);
    });
    ctx.onDispose(() => {
      listeners.forEach(remove => remove());
      window.removeEventListener('resize', resize);
      stopLongPress();
    });
  }

  function resetHistory(id: string | null = null) {
    if (historyChapterId === id) return;
    history.clear();
    historyChapterId = id;
  }

  function scheduleWordCount(value: string) {
    const revision = ++wordCountRevision;
    const target = ctx.chapter();
    const label = $('#word-value');
    clearTimeout(wordCountTimer);
    wordCountTimer = setTimeout(() => {
      wordCountClient ??= createWordCountClient();
      wordCountClient.count(value).then(result => {
        if (result !== null && revision === wordCountRevision && ctx.chapter() === target && label?.isConnected) label.textContent = String(result);
      }).catch(() => {
        if (revision === wordCountRevision && label?.isConnected) label.textContent = '—';
      });
    }, 200);
  }

  function toolbar(where: 'top' | 'bottom') {
    return state.toolbars[where]
      .filter((id): id is ToolId => id !== null)
      .map((id) => ib(tools[id][0], tools[id][1], "tool:" + id))
      .join("");
  }

  function updateHistoryTools() {
    if (state.page !== 'editor' || state.layout) return;
    const current = ctx.chapter();
    if (!current) return;
    for (const direction of ['undo', 'redo'] as const) {
      $$<HTMLButtonElement>('.editor [data-action="tool:' + direction + '"]').forEach(button => {
        button.disabled = !history.canApply(current, direction);
      });
    }
  }

  function commitBody(value: string, target?: Chapter) {
    const t = target ?? needChapter(state);
    if (state.page === 'editor' && t === ctx.chapter()) history.record(t, 'body', t.body, value);
    t.body = value;
    updateHistoryTools();
    if (t !== ctx.chapter()) return;
    const m = $(".manuscript");
    if (m) m.textContent = value;
    scheduleWordCount(value);
  }

  function clearFindHighlight() {
    if (globalThis.CSS?.highlights) CSS.highlights.delete('search-match');
  }

  function locateText(offset: number, length = 0, options: { focus?: boolean; selector?: string } = {}) {
    const selector = options.selector ?? '.manuscript';
    const element = state.page === 'reader' && selector === '.manuscript' ? ctx.reader.session()?.body() : $(selector);
    if (!element?.firstChild) return;
    const start = editorTextPoint(element, Math.min(offset, editorText(element).length));
    const end = editorTextPoint(element, Math.min(offset + length, editorText(element).length));
    if (!start || !end) return;
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    if (options.focus !== false) {
      if (state.page === 'editor') element.focus({ preventScroll: true });
      const selection = getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
    clearFindHighlight();
    if (globalThis.CSS?.highlights && globalThis.Highlight && length) CSS.highlights.set('search-match', new Highlight(range));
    const scroll = $('.editor-scroll');
    if (scroll) scroll.scrollTop += range.getBoundingClientRect().top - scroll.getBoundingClientRect().top - scroll.clientHeight / 3;
  }

  function updateFindCount() {
    const count = $maybeFind<HTMLElement>('.find-count');
    if (count) count.textContent = findOffsets.length ? `${findIndex + 1}/${findOffsets.length}` : '0/0';
  }

  function $maybeFind<T extends Element>(query: string) {
    return ctx.app.querySelector<T>(query);
  }

  function calculateFind(reset = false) {
    clearTimeout(findTimer);
    const input = $maybeFind<HTMLInputElement>('.find-bar input');
    if (!input) return;
    const query = input.value;
    lastFindQuery = query;
    findOffsets = [];
    if (query) {
      const body = needChapter(state).body;
      let offset = 0;
      while (findOffsets.length < 5000 && (offset = body.indexOf(query, offset)) >= 0) {
        findOffsets.push(offset);
        offset += Math.max(1, query.length);
      }
    }
    if (reset) {
      const after = findOffsets.findIndex(offset => offset >= findStartOffset);
      findIndex = after >= 0 ? after : findOffsets.length ? 0 : -1;
    } else if (findIndex >= findOffsets.length) {
      findIndex = findOffsets.length - 1;
    }
    updateFindCount();
    if (findIndex >= 0) locateText(findOffsets[findIndex], query.length, { focus: false });
    else clearFindHighlight();
  }

  function scheduleFind(reset = false) {
    clearTimeout(findTimer);
    findTimer = setTimeout(() => calculateFind(reset), 150);
  }

  function stepFind(direction: 1 | -1) {
    if (!findOffsets.length) calculateFind(true);
    if (!findOffsets.length) return;
    findIndex = (findIndex + direction + findOffsets.length) % findOffsets.length;
    updateFindCount();
    const query = $maybeFind<HTMLInputElement>('.find-bar input')?.value ?? '';
    locateText(findOffsets[findIndex], query.length, { focus: false });
  }

  function closeFindBar() {
    clearTimeout(findTimer);
    $maybeFind('.find-bar')?.remove();
    clearFindHighlight();
    findOffsets = [];
    findIndex = -1;
  }

  function openFindBar() {
    ctx.closeSheet();
    const existing = $maybeFind<HTMLInputElement>('.find-bar input');
    if (existing) { existing.focus(); return; }
    const body = $('.manuscript');
    findStartOffset = captureSelection(body, 'body')?.end ?? findStartOffset;
    $('.editor > .topbar').insertAdjacentHTML('afterend', `<div class="find-bar" role="search"><input aria-label="查找本章" placeholder="查找本章" enterkeyhint="search" value="${esc(lastFindQuery)}"><span class="find-count">0/0</span>${ib('chevron-up', '上一处', 'find-prev')}${ib('chevron-down', '下一处', 'find-next')}${ib('replace', '替换', 'find-replace')}${ib('x', '关闭查找', 'find-close')}</div>`);
    const input = $maybeFind<HTMLInputElement>('.find-bar input')!;
    input.focus();
    if (lastFindQuery) calculateFind(true);
  }

  async function applyFormat(all = false) {
    const targets = all ? needBook(state).chapters : [needChapter(state)];
    pendingFormat = targets.map(c => ({ chapter: c, before: c.body, after: formatText(c.body, state.prefs) })).filter(change => change.before !== change.after);
    if (!pendingFormat.length) { ctx.closeSheet(); return; }
    await ctx.action('apply-format:' + (all ? 'book' : 'chapter'));
  }

  async function applyReplace(_arg?: string, _arg2?: string, _arg3?: string, raw?: string) {
    const kind = (raw ?? '').split(':')[0];
    const q = $<HTMLInputElement>('#query').value;
    if (!q) {
      ctx.toast("先输入查找文本");
      return;
    }
    const scope = $<HTMLInputElement>('#query').dataset.scope;
    const targets = scope === 'book' ? needBook(state).chapters : [needChapter(state)];
    const hit = helpers.searchHit();
    const target = kind === 'replace-one' ? targets.find(c => c.id === hit?.chapterId) : needChapter(state);
    if (kind === 'replace' && scope === 'book') {
      const replacement = $<HTMLInputElement>('#replacement').value;
      pendingReplace = targets.filter(c => c.body.includes(q)).map(c => ({ chapter: c, before: c.body, after: replaceText(c.body, q, replacement) })).filter(change => change.before !== change.after);
      if (!pendingReplace.length) { ctx.toast('没有需要替换的内容'); return; }
      const total = pendingReplace.reduce((sum, change) => sum + change.before.split(q).length - 1, 0);
      ctx.openSheet('全书替换确认', `<p class="hint">将修改 ${pendingReplace.length} 章、${total} 处匹配。离开这本书之前，可以在书籍菜单里撤销。</p><div class="setting-label">查找文字</div><pre class="text-preview">${esc(q)}</pre><div class="setting-label">替换为</div><pre class="text-preview">${esc(replacement || '（删除匹配文字）')}</pre><button class="primary" data-action="confirm-book-replace">确认全书替换</button>`);
      return;
    }
    if (!target?.body.includes(q)) {
      ctx.toast("没有匹配文本，请等待搜索完成");
      return;
    }
    const offset = kind === 'replace-one' && hit ? hit.offset : undefined;
    const nextText = replaceText(target.body, q, $<HTMLInputElement>('#replacement').value, offset);
    commitBody(nextText, target);
    helpers.afterReplace();
    await saveNow(state);
    ctx.toast(kind === 'replace-one' ? '已替换这一处，可撤销' : '已替换本章全部匹配，可撤销');
  }
  function insertChapterAfter() {
    const b = needBook(state);
    const index = state.chapter + 1;
    const name = `第${index + 1}章`;
    b.chapters.splice(index, 0, { id: crypto.randomUUID(), name, body: '' });
    ctx.closeSheet();
    ctx.dispose();
    state.chapter = index;
    ctx.render();
    restoreSelection($('.editor-heading'), { start: 0, end: name.length, backward: false, field: 'name' }, true);
  }


  function render() {
    ctx.dispose();
    const c = ctx.chapter();
    if (!c) {
      state.page = "chapters";
      ctx.render();
      return;
    }
    resetHistory(c.id ??= crypto.randomUUID());
    ctx.app.innerHTML = `<main class="app-shell editor "><header class="topbar">${ib("chevron-left", "返回目录", "chapters")}<div class="editor-tools">${toolbar("top")}</div>${ib("ellipsis-vertical", "更多工具", "editor-menu")}</header><section class="editor-scroll" ><span class="word-count"><span class="save-dot" data-state="saved" aria-hidden="true"></span>本章字数 <span id="word-value">${wordsOf(c)}</span></span><h1 class="editor-heading" contenteditable="true" role="textbox" aria-label="章节标题">${esc(c.name)}</h1><div class="manuscript" contenteditable="true" role="textbox" aria-label="章节正文" aria-multiline="true" data-placeholder="请输入正文">${esc(c.body)}</div></section><footer class="editor-bottom">${toolbar("bottom")}</footer></main>`;
    const saveDot = $<HTMLElement>('.save-dot');
    const updateSaveDot = (event: Event) => {
      if (event instanceof CustomEvent && ['dirty', 'saving', 'saved', 'failed'].includes(event.detail)) saveDot.dataset.state = event.detail;
    };
    document.addEventListener('moye:save-state', updateSaveDot);
    ctx.onDispose(() => document.removeEventListener('moye:save-state', updateSaveDot));
    applyAppearance(ctx);
    updateHistoryTools();
    installToolbarInteractions();
    $(".manuscript").textContent = c.body;
    $(".manuscript").setAttribute('contenteditable', 'plaintext-only');
    const scroll = $(".editor-scroll");
    $(".editor-heading").setAttribute('contenteditable', 'plaintext-only');
    ctx.onDispose(attachFastScroll(scroll));
    c.id ??= crypto.randomUUID();
    const body = $(".manuscript"), title = $(".editor-heading");
    const previous = state.editing[c.id];
    scroll.scrollTop = previous?.scroll || 0;
    if (previous?.anchor) restoreAnchor(body, scroll, previous.anchor);
    let position = previous?.selection;
    if (position) restoreSelection(position.field === 'name' ? title : body, position);
    const capture = () => {
      const selected = captureSelection(body, 'body') || captureSelection(title, 'name');
      if (selected) position = { start: selected.start, end: selected.end, backward: selected.backward, field: selected.field === 'name' ? 'name' : 'body' };
      state.editing[c.id] = {
        scroll: scroll.scrollTop, selection: position,
        anchor: body.firstChild?.nodeType === Node.TEXT_NODE && body.childNodes.length === 1 ? captureAnchor(body, scroll) : undefined,
      };
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
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
      clearTimeout(findTimer);
      clearFindHighlight();
      findOffsets = [];
      findIndex = -1;
      wordCountRevision++;
      wordCountClient?.dispose();
      wordCountClient = null;
    });
    ctx.onDispose(() => { disposeEditor?.(); disposeEditor = null; });
  }

  // 编辑器的输入监听：组合输入、快捷键撤销、输入历史与字数、偏好开关。
  function install() {
    function finishComposition() {
      if (!composition) return;
      const { target, field, before } = composition;
      history.record(target, field, before, target[field]);
      composition = null;
      updateHistoryTools();
    }

    document.addEventListener('compositionstart', (event) => {
      pendingInput = null;
      if (!(event.target instanceof HTMLElement)) return;
      const field = event.target.matches('.manuscript[contenteditable]') ? 'body' : event.target.matches('.editor-heading[contenteditable]') ? 'name' : null;
      if (field) {
        const c = needChapter(state);
        composition = { target: c, field, before: c[field] };
      }
    });
    document.addEventListener('compositionend', finishComposition);
    document.addEventListener('focusout', (event) => {
      if (event.target instanceof HTMLElement && event.target.matches('.manuscript, .editor-heading')) finishComposition();
    });
    document.addEventListener('keydown', (event) => {
      if (event.target instanceof HTMLInputElement && event.target.matches('.find-bar input') && event.key === 'Enter') {
        event.preventDefault();
        stepFind(1);
        return;
      }
      if (!(event.target instanceof HTMLElement) || event.isComposing || !event.target.matches('.manuscript[contenteditable], .editor-heading[contenteditable]') || !(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      event.preventDefault();
      const redo = key === 'y' || event.shiftKey;
      ctx.action('tool:' + (redo ? 'redo' : 'undo')).catch(error => ctx.toast(String(error)));
    });
    document.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.target instanceof Element && event.target.closest('.editor:not(.reader) .editor-tools, .editor:not(.reader) .editor-bottom')) event.preventDefault();
    });
    document.addEventListener('pointerdown', (event) => {
      if (event.target instanceof Element && event.target.closest('[data-action="tool:undo"], [data-action="tool:redo"]')) event.preventDefault();
    });
    document.addEventListener('beforeinput', (event) => {
      pendingInput = null;
      if (!(event.target instanceof HTMLElement)) return;
      const element = event.target;
      if (!element.matches('.manuscript[contenteditable], .editor-heading[contenteditable]')) return;
      if (element.matches('.editor-heading')) {
        if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
          event.preventDefault();
          restoreSelection($('.manuscript'), { start: 0, end: 0, backward: false, field: 'body' }, true);
          return;
        }
        if (event.inputType === 'insertFromPaste') {
          event.preventDefault();
          const text = event.dataTransfer?.getData('text/plain').replace(/\s*[\r\n]+\s*/g, ' ') ?? '';
          document.execCommand('insertText', false, text);
          return;
        }
      }
      if (['historyUndo', 'historyRedo'].includes(event.inputType)) {
        event.preventDefault();
        ctx.action('tool:' + (event.inputType === 'historyUndo' ? 'undo' : 'redo')).catch(error => ctx.toast(String(error)));
        return;
      }
      if (composition || event.isComposing) return;
      const target = needChapter(state);
      const field = element.matches('.manuscript') ? 'body' : 'name';
      const before = target[field];
      const selection = captureSelection(element, field);
      const edit = selection && extractInputEdit(before, selection, event);
      if (edit) pendingInput = { element, target, field, before, edit };
    });
    document.addEventListener('input', (e) => {
      if (!(e.target instanceof HTMLElement)) return;
      const el = e.target;
      if (el instanceof HTMLInputElement && el.matches('.find-bar input')) {
        findStartOffset = captureSelection($('.manuscript'), 'body')?.end ?? findStartOffset;
        scheduleFind(true);
        return;
      }
      const pending = pendingInput;
      pendingInput = null;
      if (el.matches('.manuscript[contenteditable], .editor-heading[contenteditable]')) {
        const target = needChapter(state);
        const field = el.matches('.manuscript') ? 'body' : 'name';
        const before = target[field];
        const value = editorText(el);
        let hint: HistoryHint | undefined;
        if (pending?.element === el && pending.target === target && pending.field === field && pending.before === before && pending.edit.after === value) {
          const { offset, before: removed } = pending.edit;
          const insertedLength = value.length - before.length + removed.length;
          hint = { offset, before: removed, after: value.slice(offset, offset + insertedLength) };
        }
        if (!composition) history.record(target, field, before, value, hint);
        target[field] = value;
        if (field === 'body') {
          scheduleWordCount(value);
          if ($maybeFind('.find-bar')) scheduleFind(false);
        }
        updateHistoryTools();
      }
      if (el instanceof HTMLInputElement && el.dataset.color) {
        const key = el.dataset.color;
        if (key.startsWith("read")) setPanelValue(state.readPrefs, key.slice(4), el.value);
        else setPanelValue(state.prefs, key, el.value);
        applyAppearance(ctx);
        ctx.settings.syncPreferenceControls();
      }
    });
    document.addEventListener('change', (e) => {
      if (!(e.target instanceof Element)) return;
      const el = e.target;
      if (el instanceof HTMLInputElement && el.dataset.pref) {
        setPanelValue(state.prefs, el.dataset.pref, el.checked);
        applyAppearance(ctx);
      }
      if (el instanceof HTMLSelectElement && el.id === 'font-family') {
        state.prefs.fontFamily = el.value === '宋体' || el.value === '黑体' ? el.value : '系统默认';
        applyAppearance(ctx);
      }
    });
  }

  const actions: Record<string, ActionHandler> = {
    settings(arg) {
      ctx.settings.settings(arg);
    },
    grid() {
      ctx.settings.gridSettings();
    },
    line(arg) {
      if (arg === undefined || !isLineType(arg)) return;
      state.prefs.lineType = arg;
      applyAppearance(ctx);
      document.querySelectorAll<HTMLElement>('#sheet [data-action^="line:"]').forEach(button => {
        const selected = button.dataset.action === 'line:' + arg;
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
    },
    pref(arg, arg2) {
      if (arg === undefined || arg2 === undefined) return;
      const value: string | number = /^\d+(\.\d+)?$/.test(arg2) ? Number(arg2) : arg2;
      const readingPosition = state.page === 'reader' && arg === 'readtidy' ? ctx.reader.session()?.capture() : null;
      if (arg.startsWith("read")) setPanelValue(state.readPrefs, arg.slice(4), value);
      else setPanelValue(state.prefs, arg, value);
      if (readingPosition) {
        ctx.render();
        ctx.reader.session()?.restore(readingPosition);
      } else applyAppearance(ctx);
      ctx.settings.syncPreferenceControls();
    },
    'theme-preset'(arg) {
      const preset = presets[Number(arg)];
      if (!preset) return;
      Object.assign(state.prefs, { paper: preset.paper, color: preset.color });
      applyAppearance(ctx);
      ctx.settings.syncPreferenceControls();
    },
    'read-preset'(arg) {
      const preset = presets[Number(arg)];
      if (!preset) return;
      Object.assign(state.readPrefs, { paper: preset.paper, color: preset.color, night: preset.name === '夜读' });
      applyAppearance(ctx);
      ctx.settings.syncPreferenceControls();
    },
    'editor-menu'() {
      findStartOffset = captureSelection($('.manuscript'), 'body')?.end ?? findStartOffset;
      ctx.openSheet(
        "更多工具",
        toolMenu([
          ["search", "本章搜索", "chapter-search"],
          ["file-plus-2", "新建下一章", "insert-chapter-after"],
          ["file-output", "导出文档", "export"],
          ["sliders-horizontal", "页面布局", "layout"],
          ["rows-3", "网格线", "grid"],
        ]),
      );
    },
    'chapter-search'() {
      if (state.page === 'editor') openFindBar();
      else helpers.search('chapter');
    },
    'find-prev'() { stepFind(-1); },
    'find-next'() { stepFind(1); },
    'find-close'() { closeFindBar(); },
    'find-replace'() {
      const query = $maybeFind<HTMLInputElement>('.find-bar input')?.value ?? lastFindQuery;
      closeFindBar();
      helpers.search('chapter', true, query);
    },
    async tool(arg) {
      if (arg === "settings") {
        ctx.settings.settings();
        return;
      }
      if (arg === "directory") {
        openDirectory(ctx);
        return;
      }
      if (arg === "find") {
        helpers.search("chapter", true);
        return;
      }
      if (arg === "search") {
        openFindBar();
        return;
      }
      ctx.closeSheet();
      if (arg === "top" || arg === "bottom") {
        const scroll = $('.editor-scroll');
        scroll.scrollTo({
          top: arg === "top" ? 0 : scroll.scrollHeight,
          behavior: "smooth",
        });
        return;
      }
      if (arg === "keyboard") {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        if (Capacitor.isNativePlatform()) await Keyboard.hide();
        return;
      }
      if (arg === "copy") {
        try {
          await navigator.clipboard.writeText(needChapter(state).body);
          ctx.toast("已复制本章正文");
        } catch {
          ctx.toast("浏览器未允许剪贴板访问");
        }
        return;
      }
      if (arg === "undo" || arg === "redo") {
        const edit = history.apply(needChapter(state), arg);
        if (!edit) {
          ctx.toast(arg === "undo" ? "没有可撤销的操作" : "没有可重做的操作");
          return;
        }
        $(".manuscript").textContent = needChapter(state).body;
        $(".editor-heading").textContent = needChapter(state).name;
        scheduleWordCount(needChapter(state).body);
        updateHistoryTools();
        if (document.activeElement?.matches('.manuscript[contenteditable], .editor-heading[contenteditable]')) {
          locateText(edit.offset, 0, { selector: edit.field === 'body' ? '.manuscript' : '.editor-heading' });
        }
        return;
      }
      if (arg === "format") {
        await applyFormat(false);
        return;
      }
      if (arg === "previous" || arg === "next") {
        const next = state.chapter + (arg === "next" ? 1 : -1);
        if (next >= needBook(state).chapters.length) {
          insertChapterAfter();
          return;
        }
        if (next < 0) {
          ctx.toast("已经是第一章");
          return;
        }
        ctx.dispose();
        state.chapter = next;
        ctx.render();
        return;
      }
    },
    'insert-chapter-after'() {
      insertChapterAfter();
    },
    replace: applyReplace,
    'replace-one': applyReplace,
    async 'confirm-book-replace'() {
      const changes = pendingReplace;
      if (!changes?.length) return;
      if (changes.some(change => change.chapter.body !== change.before)) throw new Error('正文已变化，请重新预览替换');
      for (const change of changes) commitBody(change.after, change.chapter);
      rememberBookChange({ bookId: needBook(state).id, label: '全书替换', changes: changes.map(({ chapter, before, after }) => ({ chapterId: chapter.id, before, after })) });
      pendingReplace = null;
      ctx.closeSheet();
      await saveNow(state);
      ctx.toast('全书替换已保存');
    },
    export() {
      ctx.txt.openExport(needBook(state), needChapter(state));
    },
    async 'apply-format'(arg) {
      const changes = pendingFormat;
      if (!changes?.length) return;
      if (changes.some(change => change.chapter.body !== change.before)) throw new Error('正文已变化，请重新预览排版');
      for (const change of changes) commitBody(change.after, change.chapter);
      if (arg === 'book') rememberBookChange({ bookId: needBook(state).id, label: '全书排版', changes: changes.map(({ chapter, before, after }) => ({ chapterId: chapter.id, before, after })) });
      pendingFormat = null;
      ctx.closeSheet();
      ctx.render();
      await saveNow(state);
    },
  };

  return {
    actions,
    render,
    install,
    editor: { commitBody, locateText },
    resetHistory,
    applyFormat,
  };
}

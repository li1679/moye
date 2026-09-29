import { $, esc } from '../core/dom';
import { icon, ib } from '../kit/ui';
import { mountReader } from '../features/reader/continuous';
import { applyAppearance } from '../features/appearance';
import { needBook } from '../core/library';
import type { ActionHandler, Ctx, PageModule, ReaderSession } from '../core/context';

// 阅读器页（2.7 从 prototype.js / editor.ts 拆出）：连续阅读挂载、控制栏、夜间、阅读设置、上一章/下一章、阅读区点击。
export type ReaderModule = PageModule & { reader: Ctx['reader'] };

// 设置面板的键名来自模板字符串：与 editor.ts 相同，经 Object.assign 写入动态键。
function setPanelValue(target: object, key: string, value: string | number | boolean): void {
  Object.assign(target, { [key]: value });
}

export function createReaderPage(ctx: Ctx): ReaderModule {
  const state = ctx.state;
  let readerSession: ReaderSession | null = null;
  // 阅读区按下的位置与时间，用来区分"点按呼出控制栏"和拖动、滚动、长按。
  let readingPointer: { x: number; y: number; time: number; scroll: number } | null = null;

  function nightLabel(): string {
    return (state.readPrefs.night ?? ['#202123', '#1b1a18'].includes(state.readPrefs.paper))
      ? `${icon("sun")}日间`
      : `${icon("moon")}夜间`;
  }

  // 阅读页渲染（原 renderEditor 的阅读分支）。
  function renderReader() {
    ctx.dispose();
    const c = ctx.chapter();
    if (!c) {
      ctx.app.innerHTML = `<main class="app-shell editor reader"><header class="topbar">${ib("chevron-left", "返回阅读书架", "home")}<div class="title">${esc(ctx.book()?.name)}</div></header><div class="empty">暂无章节</div></main>`;
      return;
    }
    const b = needBook(state);
    ctx.app.innerHTML = `<main class="app-shell editor ${"reader " + (state.readerControls ? "controls" : "")}"><header class="topbar reader-top">${ib("chevron-left", "返回阅读书架", "home")}<div class="title"><small>${esc(b.name)}</small></div>${ib("search", "本书搜索", "book-search")}</header><section class="editor-scroll" data-reader="true"><div class="reader-label">${esc(b.name)} · ${state.chapter + 1} / ${b.chapters.length}</div><h1 class="editor-heading">${esc(c.name)}</h1><div class="manuscript" data-placeholder="本章暂无正文">${esc(c.body)}</div></section><div class="reader-progress"><button class="chapter-step" data-action="reader-step:-1" ${state.chapter === 0 ? "disabled" : ""}>${icon("chevron-left")}<span>上一章</span></button><input aria-label="本章阅读进度" type="range" min="0" max="100" value="0"><button class="chapter-step" data-action="reader-step:1" ${state.chapter === b.chapters.length - 1 ? "disabled" : ""}><span>下一章</span>${icon("chevron-right")}</button></div><div class="reader-footer"><span>${esc(c.name)}</span><span id="progress-value">0%</span></div><footer class="editor-bottom reader-bottom"><button data-action="directory">${icon("list-ordered")}目录</button><button data-action="night">${nightLabel()}</button><button data-action="reader-settings">${icon("settings-2")}设置</button><button data-action="chapter-search">${icon("search")}搜索</button></footer></main>`;
    applyAppearance(ctx);
    $(".manuscript").textContent = c.body;
    const scroll = $(".editor-scroll");
    b.chapters.forEach(ch => ch.id ??= crypto.randomUUID());
    readerSession = mountReader(scroll, b.chapters, state.chapter, state.reading[b.id], (position, progress) => {
      state.chapter = position.chapter;
      state.reading[b.id] = position;
      $('#progress-value').textContent = progress + '%';
      $<HTMLInputElement>('.reader-progress input').value = String(progress);
      $('.reader-footer span').textContent = b.chapters[position.chapter].name;
      $<HTMLButtonElement>('[data-action="reader-step:-1"]').disabled = position.chapter === 0;
      $<HTMLButtonElement>('[data-action="reader-step:1"]').disabled = position.chapter === b.chapters.length - 1;
    }, ctx.toast);
    ctx.onDispose(() => { readerSession?.destroy(); readerSession = null; });
    applyAppearance(ctx);
  }

  function isReadingTap(event: MouseEvent): boolean {
    if (!readingPointer || performance.now() - readingPointer.time > 500 || Math.hypot(event.clientX - readingPointer.x, event.clientY - readingPointer.y) > 10) return false;
    const scroll = $('.editor-scroll');
    if (Math.abs(scroll.scrollTop - readingPointer.scroll) > 5 || !getSelection()?.isCollapsed) return false;
    const rect = scroll.getBoundingClientRect();
    return event.clientY > rect.top + rect.height * .2 && event.clientY < rect.bottom - rect.height * .2;
  }

  // 阅读器的输入与点击监听：亮度、进度条、点按呼出控制栏。
  function install() {
    document.addEventListener('pointerdown', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      readingPointer = target?.closest('[data-reader]')
        ? { x: event.clientX, y: event.clientY, time: performance.now(), scroll: $('.editor-scroll').scrollTop }
        : null;
    }, { passive: true });
    document.addEventListener('click', (event) => {
      // 带 data-action 的点击交给全局分发；这里只处理阅读区的空白点按。
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('.drag-handle') || event.target.closest('[data-action]')) return;
      if (state.page !== 'reader' || !event.target.closest('[data-reader]') || !isReadingTap(event)) return;
      state.readerControls = !state.readerControls;
      $('.reader').classList.toggle('controls', state.readerControls);
    });
    document.addEventListener('input', (event) => {
      // 阅读亮度（data-reader-pref）与本章进度条；其余输入事件由各页面的监听处理。
      if (!(event.target instanceof HTMLInputElement)) return;
      const el = event.target;
      if (el.dataset.readerPref) {
        setPanelValue(state.readPrefs, el.dataset.readerPref, Number(el.value));
        $('.reader').style.filter = `brightness(${el.value}%)`;
      }
      if (el.matches('.reader-progress input')) readerSession?.jump(state.chapter, Number(el.value));
    });
  }

  const actions: Record<string, ActionHandler> = {
    night() {
      const p = state.readPrefs;
      const dark = p.night ?? ['#202123', '#1b1a18'].includes(p.paper);
      const themes = p.themes || { day: { paper: '#f6f1e7', color: '#1f1d1a' }, night: { paper: '#1b1a18', color: '#d9d3c7' } };
      themes[dark ? 'night' : 'day'] = { paper: p.paper, color: p.color };
      p.themes = themes;
      p.night = !dark;
      Object.assign(p, themes[dark ? 'day' : 'night']);
      applyAppearance(ctx);
      $('[data-action="night"]').innerHTML = nightLabel();
    },
    'reader-settings'() {
      ctx.settings.readerSettings();
    },
    'reader-step'(arg) {
      const target = state.chapter + Number(arg);
      if (target < 0 || target >= needBook(state).chapters.length) return;
      readerSession?.jump(target);
    },
  };

  return { actions, render: renderReader, install, reader: { session: () => readerSession } };
}

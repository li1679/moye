import { $, esc } from '../core/dom';
import { icon, ib } from '../kit/ui';
import { mountReader } from '../features/reader/continuous';
import { applyAppearance } from '../features/appearance';
import { displayBody } from '../features/reader/display';
import { MoyeNative, isNative, syncReader } from '../features/native/native';
import { isDarkPaper } from '../kit/contrast';
import { needBook } from '../core/library';
import type { ActionHandler, Ctx, PageModule, ReaderSession } from '../core/context';

// 连续阅读、控制栏、夜间主题、阅读设置和阅读区点按。
type ReaderModule = PageModule & { reader: Ctx['reader'] };

export function createReaderPage(ctx: Ctx): ReaderModule {
  const state = ctx.state;
  let readerSession: ReaderSession | null = null;
  // 阅读区按下的位置与时间，用来区分"点按呼出控制栏"和拖动、滚动、长按。
  let readingPointer: { x: number; y: number; time: number; scroll: number } | null = null;
  let clockTimer: ReturnType<typeof setInterval> | undefined;
  let batteryTimer: ReturnType<typeof setInterval> | undefined;
  const timeFormat = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  function stopImmersiveFooter(): void {
    clearInterval(clockTimer);
    clearInterval(batteryTimer);
    clockTimer = undefined;
    batteryTimer = undefined;
  }
  function syncImmersiveFooter(): void {
    stopImmersiveFooter();
    const status = document.querySelector<HTMLElement>('.reader-status');
    const time = document.querySelector<HTMLElement>('#reader-time');
    const battery = document.querySelector<HTMLElement>('#reader-battery');
    if (!status || !time || !battery) return;
    status.hidden = !state.readPrefs.immersive;
    battery.hidden = true;
    if (!state.readPrefs.immersive) return;
    const updateTime = () => { time.textContent = timeFormat.format(new Date()); };
    const updateBattery = async () => {
      if (!isNative || !state.readPrefs.immersive) return;
      try {
        const value = await MoyeNative.getBattery();
        if (!state.readPrefs.immersive || !battery.isConnected) return;
        battery.textContent = `电量 ${value.level}%${value.charging ? ' · 充电中' : ''}`;
        battery.hidden = false;
      } catch {
        battery.hidden = true;
      }
    };
    updateTime();
    clockTimer = setInterval(updateTime, 30_000);
    if (isNative) {
      void updateBattery();
      batteryTimer = setInterval(() => { void updateBattery(); }, 60_000);
    }
  }

  function nightLabel(): string {
    return isDarkPaper(state.prefs.paper)
      ? `${icon("sun")}日间`
      : `${icon("moon")}夜间`;
  }
  function pageScreen(direction: -1 | 1): void {
    const scroll = $('.editor-scroll');
    const body = readerSession?.body();
    if (!body) return;
    const lineHeight = parseFloat(getComputedStyle(body).lineHeight);
    scroll.scrollBy({
      top: direction * Math.max(0, scroll.clientHeight - 2 * lineHeight),
      behavior: 'auto',
    });
  }

  // 挂载连续阅读与控制栏。
  function renderReader() {
    ctx.dispose();
    const c = ctx.chapter();
    if (!c) {
      ctx.app.innerHTML = `<main class="app-shell editor reader"><header class="topbar">${ib("chevron-left", "返回阅读书架", "home")}<div class="title">${esc(ctx.book()?.name)}</div></header><div class="empty">暂无章节</div></main>`;
      return;
    }
    const b = needBook(state);
    ctx.app.innerHTML = `<main class="app-shell editor reader ${state.readerControls ? "controls" : ""}"><header class="topbar reader-top">${ib("chevron-left", "返回阅读书架", "home")}<div class="title"><small>${esc(b.name)}</small></div>${ib("search", "本书搜索", "book-search")}</header><section class="editor-scroll" data-reader="true"></section><div class="reader-progress"><button class="chapter-step" data-action="reader-step:-1" ${state.chapter === 0 ? "disabled" : ""}>${icon("chevron-left")}<span>上一章</span></button><input aria-label="本章阅读进度" type="range" min="0" max="100" value="0"><button class="chapter-step" data-action="reader-step:1" ${state.chapter === b.chapters.length - 1 ? "disabled" : ""}><span>下一章</span>${icon("chevron-right")}</button></div><div class="reader-footer"><span>${esc(c.name)}</span><span class="reader-footer-meta"><span class="reader-status" hidden><span id="reader-time"></span><span id="reader-battery" hidden></span></span><span><span id="chapter-position">${state.chapter + 1}/${b.chapters.length}</span> · <span id="progress-value">0%</span></span></span></div><footer class="editor-bottom reader-bottom"><button data-action="directory">${icon("list-ordered")}目录</button><button data-action="night">${nightLabel()}</button><button data-action="reader-settings">${icon("settings-2")}设置</button><button data-action="chapter-search">${icon("search")}搜索</button></footer></main>`;
    applyAppearance(ctx);
    const scroll = $(".editor-scroll");
    readerSession = mountReader(scroll, b.chapters, state.chapter, state.reading[b.id], (position, progress) => {
      state.chapter = position.chapter;
      state.reading[b.id] = { ...position, percent: progress, at: Date.now() };
      $('#progress-value').textContent = progress + '%';
      $('#chapter-position').textContent = `${position.chapter + 1}/${b.chapters.length}`;
      $<HTMLInputElement>('.reader-progress input').value = String(progress);
      $('.reader-footer span').textContent = b.chapters[position.chapter].name;
      $<HTMLButtonElement>('[data-action="reader-step:-1"]').disabled = position.chapter === 0;
      $<HTMLButtonElement>('[data-action="reader-step:1"]').disabled = position.chapter === b.chapters.length - 1;
    }, ctx.toast, chapter => displayBody(chapter, state.readPrefs.tidy));
    ctx.onDispose(() => { readerSession?.destroy(); readerSession = null; });
    ctx.onDispose(stopImmersiveFooter);
    syncImmersiveFooter();
    applyAppearance(ctx);
  }

  function isReadingTap(event: MouseEvent): boolean {
    if (!readingPointer || performance.now() - readingPointer.time > 500 || Math.hypot(event.clientX - readingPointer.x, event.clientY - readingPointer.y) > 10) return false;
    const scroll = $('.editor-scroll');
    if (Math.abs(scroll.scrollTop - readingPointer.scroll) > 5 || !getSelection()?.isCollapsed) return false;
    return true;
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
      const reader = $('.reader');
      if (state.readerControls) {
        state.readerControls = false;
        reader.classList.remove('controls');
        return;
      }
      const rect = $('.editor-scroll').getBoundingClientRect();
      const ratio = (event.clientY - rect.top) / rect.height;
      if (ratio >= 1 / 3 && ratio <= 2 / 3) {
        state.readerControls = true;
        reader.classList.add('controls');
      } else if (state.readPrefs.tapPaging) pageScreen(ratio < 1 / 3 ? -1 : 1);
    });
    document.addEventListener('input', (event) => {
      // 阅读亮度（data-reader-pref）与本章进度条；其余输入事件由各页面的监听处理。
      if (!(event.target instanceof HTMLInputElement)) return;
      const el = event.target;
      if (el.dataset.readerPref) {
        ctx.settings.setPreference('read' + el.dataset.readerPref, Number(el.value));
        $('.reader').style.filter = !isNative && !state.readPrefs.brightnessAuto ? `brightness(${el.value}%)` : '';
        syncReader(state.readPrefs);
      }
      if (el.matches('.reader-progress input')) readerSession?.jump(state.chapter, Number(el.value));
    });
    document.addEventListener('change', (event) => {
      if (!(event.target instanceof HTMLInputElement) || !event.target.dataset.readSwitch) return;
      ctx.settings.setPreference('read' + event.target.dataset.readSwitch, event.target.checked);
      const brightness = document.querySelector<HTMLInputElement>('[data-reader-pref="brightness"]');
      if (brightness) brightness.disabled = state.readPrefs.brightnessAuto;
      applyAppearance(ctx);
      syncReader(state.readPrefs);
      syncImmersiveFooter();
    });
  }

  const actions: Record<string, ActionHandler> = {
    night() {
      const p = state.readPrefs;
      const theme = state.prefs;
      const dark = isDarkPaper(theme.paper);
      const themes = p.themes || { day: { paper: '#f6f1e7', color: '#1f1d1a' }, night: { paper: '#1b1a18', color: '#d9d3c7' } };
      themes[dark ? 'night' : 'day'] = { paper: theme.paper, color: theme.color };
      p.themes = themes;
      p.night = !dark;
      const next = themes[dark ? 'day' : 'night'];
      Object.assign(theme, next);
      Object.assign(p, next);
      applyAppearance(ctx);
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

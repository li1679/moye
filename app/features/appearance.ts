import { $, $maybe } from '../core/dom';
import { captureAnchor, restoreAnchor } from './editor/positions';
import { isNative, syncNativeTheme } from './native/native';
import { isDarkPaper } from '../kit/contrast';
import { icon } from '../kit/ui';
import type { Ctx } from '../core/context';
import type { Prefs } from '../data/schema';

export function applyTheme(theme: Prefs): void {
  const root = document.documentElement;
  root.style.setProperty('--theme-paper', theme.paper);
  root.style.setProperty('--theme-ink', theme.color);
  root.style.setProperty('--paper', theme.paper);
  root.style.setProperty('--text', theme.color);
  const dark = isDarkPaper(theme.paper);
  root.style.colorScheme = dark ? 'dark' : 'light';
  const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeMeta) themeMeta.content = theme.paper;
  syncNativeTheme(theme.paper, dark);
}

// 只有排版变化才捕获/恢复位置，纯配色和原生开关不重新定位或保存阅读进度。
export function applyAppearance(ctx: Ctx): void {
  const state = ctx.state;
  const p = state.page === 'reader' ? state.readPrefs : state.prefs;
  const root = document.documentElement;
  const r = state.page === 'reader' ? $('.reader') : root;
  const bodyFont = state.prefs.fontFamily === '宋体' ? 'var(--font-serif)'
    : state.prefs.fontFamily === '黑体' ? 'var(--font-sans-cjk)' : 'inherit';
  const typography: Record<string, string> = {
    '--font-size': p.font + 'px', '--leading': String(p.line),
    '--margin': (p.margin ?? 24) + 'px', '--bottom': (p.bottom ?? 80) + 'px',
    '--body-weight': state.page !== 'reader' && state.prefs.bold ? '600' : '400',
    ...(state.page === 'reader' ? { '--reader-font': p.fontFamily === '宋体' ? 'var(--font-serif)' : p.fontFamily === '黑体' ? 'var(--font-sans-cjk)' : 'inherit' } : {}),
  };
  const changed = Object.entries(typography).some(([key, value]) => r.style.getPropertyValue(key) !== value)
    || (state.page === 'editor' && root.style.getPropertyValue('--body-font') !== bodyFont);
  const session = ctx.reader.session();
  const readingAnchor = changed ? session?.capture() : null;
  const scroll = $('.editor-scroll');
  const oldBody = $maybe('.editor:not(.reader) .manuscript');
  const editingAnchor = changed && oldBody && scroll && oldBody.firstChild?.nodeType === Node.TEXT_NODE ? captureAnchor(oldBody, scroll) : null;
  const theme = state.prefs;
  applyTheme(theme);
  const nightButton = $maybe('[data-action="night"]');
  if (nightButton) nightButton.innerHTML = isDarkPaper(theme.paper) ? `${icon('sun')}日间` : `${icon('moon')}夜间`;
  for (const [key, value] of Object.entries(typography)) r.style.setProperty(key, value);
  r.style.setProperty('--paper', theme.paper);
  r.style.setProperty('--text', theme.color);
  root.style.setProperty('--body-font', bodyFont);
  const reader = $maybe('.reader');
  if (reader) reader.style.filter = !isNative && !state.readPrefs.brightnessAuto ? `brightness(${state.readPrefs.brightness}%)` : '';
  const m = $maybe('.manuscript');
  if (m) {
    m.classList.toggle('rules', state.page === 'editor' && state.prefs.grid);
    if (state.page === 'editor' && state.prefs.grid) {
      const pref = state.prefs;
      const width = pref.thick ? 2 : 1;
      const dash = pref.lineType === '实线' ? '' : pref.lineType === '长虚线' ? '12 7' : pref.lineType === '短虚线' ? '5 4' : '1 4';
      const lineHeight = parseFloat(getComputedStyle(m).lineHeight);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${lineHeight}"><path d="M0 ${lineHeight - width / 2} H1000" stroke="${pref.lineColor}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ''}/></svg>`;
      m.style.setProperty('--rule-image', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
      m.style.setProperty('--rule-offset', pref.near ? '-4px' : '0px');
      m.style.setProperty('--rule-height', lineHeight + 'px');
    }
  }
  if (readingAnchor && session) session.restore(readingAnchor);
  if (editingAnchor && oldBody) restoreAnchor(oldBody, scroll, editingAnchor);
}

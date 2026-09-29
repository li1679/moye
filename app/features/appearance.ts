import { $, $maybe } from '../core/dom';
import { captureAnchor, restoreAnchor } from './editor/positions';
import type { Ctx } from '../core/context';

// 应用排版外观：字号、行距、纸色、字色、网格线，并保持阅读/编辑的滚动位置。
export function applyAppearance(ctx: Ctx): void {
  const state = ctx.state;
  const session = ctx.reader.session();
  const readingAnchor = session?.capture();
  const scroll = $('.editor-scroll');
  const oldBody = $maybe('.editor:not(.reader) .manuscript');
  const editingAnchor = oldBody && scroll && oldBody.firstChild?.nodeType === Node.TEXT_NODE ? captureAnchor(oldBody, scroll) : null;
  const p = state.page === 'reader' ? state.readPrefs : state.prefs;
  const r = state.page === 'reader' ? $('.reader') : document.documentElement;
  r.style.setProperty('--font-size', p.font + 'px');
  r.style.setProperty('--leading', String(p.line));
  r.style.setProperty('--paper', p.paper);
  r.style.setProperty('--text', p.color);
  r.style.setProperty('--margin', (p.margin ?? 24) + 'px');
  r.style.setProperty('--bottom', (p.bottom ?? 80) + 'px');
  r.style.setProperty('--body-weight', state.page !== 'reader' && state.prefs.bold ? '600' : '400');
  document.documentElement.style.setProperty(
    '--body-font',
    state.prefs.fontFamily === '宋体'
      ? 'var(--font-serif)'
      : state.prefs.fontFamily === '黑体'
        ? 'var(--font-sans-cjk)'
        : 'inherit',
  );
  const reader = $maybe('.reader');
  if (reader) reader.style.filter = `brightness(${state.readPrefs.brightness}%)`;
  const m = $maybe('.manuscript');
  if (m) {
    m.classList.toggle('rules', state.page === 'editor' && state.prefs.grid);
    const pref = state.prefs;
    const width = pref.thick ? 2 : 1;
    const dash =
      pref.lineType === '实线'
        ? ''
        : pref.lineType === '长虚线'
          ? '12 7'
          : pref.lineType === '短虚线'
            ? '5 4'
            : '1 4';
    const lineHeight = parseFloat(getComputedStyle(m).lineHeight);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${lineHeight}"><path d="M0 ${lineHeight - width / 2} H1000" stroke="${pref.lineColor}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ''}/></svg>`;
    m.style.setProperty(
      '--rule-image',
      `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    );
    m.style.setProperty('--rule-offset', pref.near ? '-4px' : '0px');
    m.style.setProperty('--rule-height', lineHeight + 'px');
  }
  if (readingAnchor && session) session.restore(readingAnchor);
  if (editingAnchor && oldBody) restoreAnchor(oldBody, scroll, editingAnchor);
}

import { esc } from '../core/dom';
import { icon } from '../kit/ui';
import { attachFastScroll } from '../kit/fast-scroll';
import { wordsOf } from './editor/text-tools';
import { openChapter } from '../pages/chapters';
import { needBook } from '../core/library';
import type { ActionHandler, Ctx, PageModule } from '../core/context';

let detachDirectoryFastScroll: (() => void) | null = null;
// 目录面板：列出章节、正倒序切换、跳章。
export function openDirectory(ctx: Ctx, reverse = false): void {
  const state = ctx.state;
  state.directoryReverse = reverse;
  const allChapters = needBook(ctx.state).chapters;
  const chapters = allChapters.map((c, i) => ({ c, i }));
  if (reverse) chapters.reverse();
  ctx.openSheet(
    '目录',
    (allChapters.length > 50
      ? `<form id="directory-jump" class="directory-jump"><input type="number" inputmode="numeric" min="1" max="${allChapters.length}" aria-label="跳到第几章" placeholder="跳到第几章"><button class="text-action">跳转</button></form>`
      : '') + chapters
        .map(
          ({ c, i }) =>
            `<button class="chapter-row ${i === state.chapter ? 'current' : ''}" data-action="jump-chapter:${i}" ${i === state.chapter ? 'aria-current="true"' : ''}><div class="chapter-info"><strong>${esc(c.name)}</strong><small>${wordsOf(c)} 字</small></div>${i === state.chapter ? icon('check') : ''}</button>`,
        )
        .join(''),
    {
      className: 'directory-sheet',
      header: `<h2>目录</h2><button class="text-action" data-action="directory-sort">${icon('arrow-up-down')}${reverse ? '正序' : '倒序'}</button>`,
    },
  );
  requestAnimationFrame(() => {
    const current = ctx.sheet.querySelector<HTMLElement>('.chapter-row.current');
    const content = ctx.sheet.querySelector<HTMLElement>('.sheet-content');
    if (current && content) content.scrollTop = Math.max(0, current.offsetTop - content.clientHeight / 3);
    detachDirectoryFastScroll?.();
    if (!content) return;
    const detach = attachFastScroll(content);
    detachDirectoryFastScroll = detach;
    ctx.sheet.addEventListener('close', () => {
      if (detachDirectoryFastScroll === detach) detachDirectoryFastScroll = null;
      detach();
    }, { once: true });
  });
}

export function createDirectory(ctx: Ctx): PageModule {
  function install() {
    document.addEventListener('submit', event => {
      if (!(event.target instanceof HTMLFormElement) || event.target.id !== 'directory-jump') return;
      event.preventDefault();
      const total = needBook(state).chapters.length;
      const input = event.target.querySelector<HTMLInputElement>('input');
      const chapter = Math.min(total, Math.max(1, Math.trunc(Number(input?.value) || 1)));
      void ctx.action(`jump-chapter:${chapter - 1}`);
    });
  }
  const state = ctx.state;
  const actions: Record<string, ActionHandler> = {
    directory() {
      openDirectory(ctx);
    },
    'directory-sort'() {
      openDirectory(ctx, !state.directoryReverse);
    },
    'jump-chapter'(arg) {
      if (state.page === 'reader') {
        ctx.reader.session()?.jump(Number(arg));
        ctx.closeSheet();
        return;
      }
      openChapter(ctx, arg);
    },
  };
  return { actions, install };
}

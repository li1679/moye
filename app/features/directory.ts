import { $, esc } from '../core/dom';
import { icon } from '../kit/ui';
import { wordsOf } from './editor/text-tools';
import { openChapter } from '../pages/chapters';
import { needBook } from '../core/library';
import type { ActionHandler, Ctx, PageModule } from '../core/context';

// 目录面板：列出章节、正倒序切换、跳章。
export function openDirectory(ctx: Ctx, reverse = false): void {
  const state = ctx.state;
  state.directoryReverse = reverse;
  const chapters = needBook(ctx.state).chapters.map((c, i) => ({ c, i }));
  if (reverse) chapters.reverse();
  ctx.openSheet(
    '目录',
    chapters
      .map(
        ({ c, i }) =>
          `<button class="chapter-row" data-action="jump-chapter:${i}"><div class="chapter-info"><strong ${i === state.chapter ? 'style="color:var(--accent)"' : ''}>${esc(c.name)}</strong><small>${wordsOf(c)} 字</small></div>${i === state.chapter ? icon('check') : ''}</button>`,
      )
      .join(''),
    {
      className: 'directory-sheet',
      header: `<h2>目录</h2><button class="text-action" data-action="directory-sort">${icon('arrow-up-down')}${reverse ? '正序' : '倒序'}</button>`,
    },
  );
  $('.sheet-content', ctx.sheet).scrollTop = 0;
}

export function createDirectory(ctx: Ctx): PageModule {
  const state = ctx.state;
  const actions: Record<string, ActionHandler> = {
    directory() {
      openDirectory(ctx);
    },
    'directory-sort'() {
      openDirectory(ctx, !state.directoryReverse);
    },
    'jump-chapter'(arg) {
      openChapter(ctx, arg);
    },
  };
  return { actions };
}

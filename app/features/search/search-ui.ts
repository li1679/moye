import { $, esc } from '../../core/dom';
import { icon } from '../../kit/ui';
import { needBook } from '../../core/library';
import { SearchClient } from '../editor/search-client';
import type { SearchDocument, SearchHit } from '../editor/text-tools';
import { bookWords } from '../editor/text-tools';
import type { ActionHandler, Ctx, PageModule } from '../../core/context';

// 各搜索面板与结果处理（2.9 从 prototype.js 拆出）：全部书籍/本书/本章搜索、书名搜索、
// 查找替换面板与命中跳转。编辑器的 find 工具和书架的书名搜索经组装层从这里注入。
export type SearchUi = PageModule & {
  search(scope?: string, replace?: boolean): void;
  searchBooks(): void;
  searchHit(): { chapterId: string; offset: number } | null;
  afterReplace(): void;
};

export function createSearchUi(ctx: Ctx): SearchUi {
  const state = ctx.state;
  let searchPage = 0;
  let searchRevision = 0;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  const searchClient = new SearchClient();
  let currentHits: SearchHit[] = [];
  let selectedMatch: SearchHit | null = null;

  function searchResults() {
    clearTimeout(searchTimer);
    searchClient.cancel();
    const revision = ++searchRevision;
    const q = $<HTMLInputElement>("#query").value;
    const scope = $<HTMLInputElement>("#query").dataset.scope;
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
      const documents: SearchDocument[] = [];
      for (const b of scope === 'global' ? state.books : [needBook(state)]) {
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
        // 搜索线程只会抛 Error 或 AbortError 的 DOMException；其余形态按原文案显示。
        const name = error instanceof Error ? error.name : error instanceof DOMException ? error.name : undefined;
        if (revision === searchRevision && $("#search-results") && name !== 'AbortError') $("#search-results").textContent = '搜索失败：' + (error instanceof Error ? error.message : String(error));
      }
    }, 160);
  }

  function search(scope = "book", replace = false) {
    searchPage = 0;
    selectedMatch = null;
    ctx.openSheet(
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
      $('.sheet-content', ctx.sheet).prepend(label);
      const select = label.querySelector('select');
      if (select) select.onchange = event => {
        const target = event.target instanceof HTMLSelectElement ? event.target : null;
        if (!target) return;
        $<HTMLInputElement>('#query').dataset.scope = target.value;
        $('[data-action="replace"]').textContent = target.value === 'book' ? '预览全书替换' : '替换本章全部';
        searchPage = 0;
        selectedMatch = null;
        searchResults();
      };
    }
  }

  function searchBooks() {
    ctx.openSheet(
      "搜索书籍",
      `<div class="search-input">${icon("search")}<input id="query" aria-label="书籍名称" placeholder="输入书名" data-scope="titles"></div><div id="search-results"><div class="empty">输入要查找的书名</div></div>`,
    );
  }

  function openSearch(_arg?: string, _arg2?: string, _arg3?: string, raw?: string) {
    const kind = (raw ?? '').split(':')[0];
    search(
      kind === "global-search"
        ? "global"
        : kind === "chapter-search"
          ? "chapter"
          : "book",
    );
  }

  // 弹层关闭时停掉待执行的搜索；输入框文字变化时重新搜索。
  function install() {
    ctx.sheet.addEventListener('close', () => {
      searchRevision++;
      clearTimeout(searchTimer);
      searchClient.dispose();
    });
    document.addEventListener('input', (event) => {
      if (!(event.target instanceof HTMLInputElement)) return;
      if (event.target.id === 'query') {
        searchPage = 0;
        selectedMatch = null;
        searchResults();
      }
    });
  }

  const actions: Record<string, ActionHandler> = {
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
        ctx.sheet.querySelectorAll<HTMLElement>('.result').forEach(element => element.setAttribute('aria-pressed', String(element.dataset.action === 'match-hit:' + arg)));
        return;
      }
      const targetBook = state.books.find(b => b.id === hit.bookId);
      const index = targetBook?.chapters.findIndex(c => c.id === hit.chapterId);
      if (!targetBook || index === undefined || index < 0 || targetBook.chapters[index].body.slice(hit.offset, hit.offset + hit.match.length) !== hit.match) {
        ctx.toast('匹配内容已变化，请重新搜索');
        searchResults();
        return;
      }
      state.book = hit.bookId;
      state.chapter = index;
      state.page = state.tab === "read" ? "reader" : "editor";
      if (state.page === 'reader') state.reading[state.book] = { chapter: index, chapterId: hit.chapterId, scroll: 0 };
      ctx.closeSheet();
      ctx.render();
      requestAnimationFrame(() => ctx.editor.locateText(hit.offset, hit.match.length));
    },
  };

  return {
    actions,
    install,
    search,
    searchBooks,
    searchHit: () => selectedMatch || currentHits[0],
    afterReplace: () => { selectedMatch = null; searchPage = 0; searchResults(); },
  };
}

import { captureAnchor, restoreAnchor, type Anchor } from '../editor/positions';
type Chapter = { id: string; name: string; body: string };
export type ReadingPosition = { chapter: number; chapterId?: string; scroll: number; anchor?: Anchor };

export function mountReader(scroll: HTMLElement, chapters: Chapter[], initial: number, saved: ReadingPosition | undefined, update: (position: ReadingPosition, progress: number) => void, notice: (message: string) => void) {
  scroll.replaceChildren();
  const sections = chapters.map((chapter, index) => {
    const section = document.createElement('article');
    section.className = 'reading-chapter';
    section.dataset.chapterId = chapter.id;
    // Keep real chapter geometry: estimated offscreen heights can change after
    // restoreAnchor and move the viewport into a different chapter on reflow.
    const title = document.createElement('h1');
    title.className = 'editor-heading';
    title.textContent = chapter.name;
    const body = document.createElement('div');
    body.className = 'manuscript';
    body.textContent = chapter.body;
    body.dataset.placeholder = '本章暂无正文';
    section.append(title, body);
    scroll.append(section);
    return { section, body, index };
  });
  const end = document.createElement('p');
  end.className = 'reading-end';
  end.textContent = '已到全书末尾';
  scroll.append(end);
  let active = initial;
  let seekTop: number | undefined;
  let seekProgress = 0;
  let frame = 0, timer: ReturnType<typeof setTimeout> | undefined;
  const top = (element: HTMLElement) => element.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop;
  const limits = (index: number) => {
    const start = top(sections[index].section);
    const end = index + 1 < sections.length
      ? top(sections[index + 1].section) - scroll.clientHeight
      : scroll.scrollHeight - scroll.clientHeight;
    return { start, length: Math.max(0, end - start) };
  };
  const percentage = (start: number, length: number) => length
    ? Math.max(0, Math.min(100, Math.round((scroll.scrollTop - start) / length * 100)))
    : seekTop !== undefined ? seekProgress : 0;
  const save = () => {
    if (!scroll.isConnected) return;
    const current = sections[active];
    const { start, length } = limits(active);
    const progress = percentage(start, length);
    update({ chapter: active, chapterId: chapters[active].id, scroll: Math.max(0, scroll.scrollTop - start), anchor: captureAnchor(current.body, scroll) }, progress);
  };
  const onScroll = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      // A slider seek must not be reinterpreted as entering another chapter,
      // including chapters shorter than one screen or clamped at book end.
      if (seekTop !== undefined && Math.abs(scroll.scrollTop - seekTop) < 1) {
        save();
        return;
      }
      seekTop = undefined;
      let low = 0, high = sections.length - 1;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (top(sections[mid].section) <= scroll.scrollTop + 18) low = mid; else high = mid - 1;
      }
      active = low;
      clearTimeout(timer);
      // Update the chapter immediately; bound text-anchor work during scrolling.
      const { start, length } = limits(active);
      update({ chapter: active, chapterId: chapters[active].id, scroll: Math.max(0, scroll.scrollTop - start) }, percentage(start, length));
      timer = setTimeout(save, 120);
    });
  };
  const jump = (index: number, percentage = 0) => {
    active = Math.max(0, Math.min(chapters.length - 1, index));
    const { start, length } = limits(active);
    scroll.scrollTop = start + length * percentage / 100;
    seekTop = scroll.scrollTop;
    seekProgress = percentage;
    save();
  };
  const match = saved?.chapterId ? chapters.findIndex(chapter => chapter.id === saved.chapterId) : saved?.chapter;
  const restored = saved && match === initial;
  jump(initial);
  if (restored) {
    if (saved.anchor) {
      if (!restoreAnchor(sections[initial].body, scroll, saved.anchor)) notice('原阅读位置的文字已变化，已定位到附近');
    } else scroll.scrollTop = top(sections[initial].section) + saved.scroll;
    save();
  }
  scroll.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', save);
  return {
    jump,
    body: () => sections[active].body,
    capture: () => ({ chapter: active, anchor: captureAnchor(sections[active].body, scroll) }),
    restore(position: { chapter: number; anchor: Anchor }) {
      active = position.chapter;
      restoreAnchor(sections[active].body, scroll, position.anchor);
      save();
    },
    save,
    destroy() { save(); clearTimeout(timer); cancelAnimationFrame(frame); scroll.removeEventListener('scroll', onScroll); document.removeEventListener('visibilitychange', save); },
  };
}

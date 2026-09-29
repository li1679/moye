import { captureAnchor, restoreAnchor, type Anchor } from '../editor/positions';

type Chapter = { id: string; name: string; body: string };
type ReaderNode = { section: HTMLElement; body: HTMLElement };
export type ReadingPosition = { chapter: number; chapterId?: string; scroll: number; anchor?: Anchor };

const RADIUS = 1;
const MAX = 5;
const EDGE = 1.5;
const KEEP = 2;

export function mountReader(
  scroll: HTMLElement,
  chapters: Chapter[],
  initial: number,
  saved: ReadingPosition | undefined,
  update: (position: ReadingPosition, progress: number) => void,
  notice: (message: string) => void,
  text: (chapter: Chapter) => string = chapter => chapter.body,
) {
  const nodes = new Map<number, ReaderNode>();
  const end = document.createElement('p');
  end.className = 'reading-end';
  end.textContent = '已到全书末尾';
  let first = 0;
  let last = -1;
  let active = Math.max(0, Math.min(chapters.length - 1, initial));
  let seekTop: number | undefined;
  let seekProgress = 0;
  let frame = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const make = (index: number): ReaderNode => {
    const chapter = chapters[index];
    const section = document.createElement('article');
    section.className = 'reading-chapter';
    section.dataset.index = String(index);
    section.dataset.chapterId = chapter.id;
    const title = document.createElement('h1');
    title.className = 'editor-heading';
    title.textContent = chapter.name;
    const body = document.createElement('div');
    body.className = 'manuscript';
    body.textContent = text(chapter);
    body.dataset.placeholder = '本章暂无正文';
    section.append(title, body);
    return { section, body };
  };
  const renderRange = (from: number, to: number) => {
    nodes.clear();
    first = from;
    last = to;
    const fragment = document.createDocumentFragment();
    for (let index = from; index <= to; index++) {
      const node = make(index);
      nodes.set(index, node);
      fragment.append(node.section);
    }
    if (to === chapters.length - 1) fragment.append(end);
    scroll.replaceChildren(fragment);
  };
  const shift = (delta: number) => {
    scroll.scrollTop += delta;
    if (seekTop !== undefined) seekTop += delta;
  };
  const top = (element: HTMLElement) => element.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop;
  const limits = (index: number) => {
    const section = nodes.get(index)!.section;
    return {
      start: top(section),
      length: Math.max(0, section.getBoundingClientRect().height - scroll.clientHeight),
    };
  };
  const percentage = (start: number, length: number) => length
    ? Math.max(0, Math.min(100, Math.round((scroll.scrollTop - start) / length * 100)))
    : seekTop !== undefined ? seekProgress : 0;
  const append = () => {
    if (last >= chapters.length - 1) return false;
    const index = last + 1;
    const node = make(index);
    nodes.set(index, node);
    if (end.isConnected) scroll.insertBefore(node.section, end);
    else scroll.append(node.section);
    last = index;
    if (last === chapters.length - 1) scroll.append(end);
    return true;
  };
  const prepend = () => {
    if (first <= 0) return false;
    const before = scroll.scrollHeight;
    const index = first - 1;
    const node = make(index);
    nodes.set(index, node);
    scroll.prepend(node.section);
    first = index;
    shift(scroll.scrollHeight - before);
    return true;
  };
  const trim = () => {
    while (last - first + 1 > MAX) {
      let removed = false;
      const next = nodes.get(first + 1);
      if (first < active && next && top(next.section) <= scroll.scrollTop - KEEP * scroll.clientHeight) {
        const before = scroll.scrollHeight;
        nodes.get(first)!.section.remove();
        nodes.delete(first);
        first++;
        shift(scroll.scrollHeight - before);
        removed = true;
      }
      const tail = nodes.get(last);
      if (last - first + 1 > MAX && last > active && tail && top(tail.section) >= scroll.scrollTop + (KEEP + 1) * scroll.clientHeight) {
        tail.section.remove();
        nodes.delete(last);
        last--;
        end.remove();
        removed = true;
      }
      if (!removed) break;
    }
  };
  const fill = () => {
    while (last < chapters.length - 1 && scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < scroll.clientHeight * EDGE) append();
    while (first > 0 && scroll.scrollTop < scroll.clientHeight * EDGE) prepend();
    trim();
  };
  const save = () => {
    if (!scroll.isConnected) return;
    const current = nodes.get(active);
    if (!current) return;
    const { start, length } = limits(active);
    const progress = percentage(start, length);
    update({
      chapter: active,
      chapterId: chapters[active].id,
      scroll: Math.max(0, scroll.scrollTop - start),
      anchor: captureAnchor(current.body, scroll),
    }, progress);
  };
  const onScroll = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      fill();
      if (seekTop !== undefined && Math.abs(scroll.scrollTop - seekTop) < 1) {
        save();
        return;
      }
      seekTop = undefined;
      let low = first;
      let high = last;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (top(nodes.get(mid)!.section) <= scroll.scrollTop + 18) low = mid;
        else high = mid - 1;
      }
      active = low;
      clearTimeout(timer);
      const { start, length } = limits(active);
      update({ chapter: active, chapterId: chapters[active].id, scroll: Math.max(0, scroll.scrollTop - start) }, percentage(start, length));
      timer = setTimeout(save, 120);
    });
  };
  const jump = (index: number, pct = 0) => {
    const target = Math.max(0, Math.min(chapters.length - 1, index));
    if (target < first || target > last) {
      renderRange(Math.max(0, target - RADIUS), Math.min(chapters.length - 1, target + RADIUS));
    }
    active = target;
    let range = limits(active);
    scroll.scrollTop = range.start + range.length * pct / 100;
    fill();
    range = limits(active);
    scroll.scrollTop = range.start + range.length * pct / 100;
    seekTop = scroll.scrollTop;
    seekProgress = pct;
    save();
  };

  renderRange(Math.max(0, active - RADIUS), Math.min(chapters.length - 1, active + RADIUS));
  const match = saved?.chapterId ? chapters.findIndex(chapter => chapter.id === saved.chapterId) : saved?.chapter;
  const restored = saved && match === active;
  jump(active);
  if (restored) {
    const current = nodes.get(active)!;
    if (saved.anchor) {
      if (!restoreAnchor(current.body, scroll, saved.anchor)) notice('原阅读位置的文字已变化，已定位到附近');
    } else {
      scroll.scrollTop = limits(active).start + saved.scroll;
    }
    save();
  }
  scroll.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', save);

  return {
    jump,
    body: () => nodes.get(active)!.body,
    capture: () => ({ chapter: active, anchor: captureAnchor(nodes.get(active)!.body, scroll) }),
    restore(position: { chapter: number; anchor: Anchor }) {
      const target = Math.max(0, Math.min(chapters.length - 1, position.chapter));
      if (target < first || target > last) jump(target);
      active = target;
      restoreAnchor(nodes.get(active)!.body, scroll, position.anchor);
      save();
    },
    save,
    destroy() {
      save();
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      scroll.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', save);
    },
  };
}

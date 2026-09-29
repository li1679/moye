import type { IconName } from '../kit/icons';
export type SheetOptions = { key?: string; className?: string; header?: string; label?: string };
type SavedPanel = { key: string | null; className: string; nodes: ChildNode[]; scroll: number; focus: Element | null; label: string };
export function createSheets(sheet: HTMLDialogElement, helpers: { escape: (text: string) => string; button: (icon: IconName, label: string, action: string) => string; restored: () => void }) {
  const stack: SavedPanel[] = [];
  let key: string | null = null;
  let returnFocus: HTMLElement | null = null;
  const content = () => sheet.querySelector<HTMLElement>('.sheet-content');
  const focus = (element: Element | null) => { if (element instanceof HTMLElement && element.isConnected) element.focus({ preventScroll: true }); };
  let transition: Animation | undefined;
  const stopTransition = () => { transition?.cancel(); transition = undefined; };
  function animate() {
    stopTransition();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    transition = content()?.animate([{ opacity: .65 }, { opacity: 1 }], { duration: 120, easing: 'ease-out' });
  }
  function open(title: string, body: string, options: SheetOptions = {}) {
    const wasOpen = sheet.open;
    stopTransition();
    const nextKey = options.key || `${options.className || ''}:${title}`;
    const samePage = wasOpen && key === nextKey;
    const scroll = content()?.scrollTop || 0;
    if (!wasOpen) { stack.length = 0; returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null; }
    else if (!samePage) stack.push({ key, className: sheet.className, nodes: [...sheet.childNodes], scroll, focus: document.activeElement, label: sheet.getAttribute('aria-label') || '' });
    key = nextKey;
    sheet.className = options.className || '';
    sheet.setAttribute('aria-label', options.label || title || '显示设置');
    sheet.innerHTML = `<div class="sheet-head ${options.header ? 'sheet-custom-head' : 'sheet-title-head'}">${stack.length ? helpers.button('chevron-left', '返回上一级', 'sheet-back') : ''}${options.header || `<h2>${helpers.escape(title)}</h2>`}${helpers.button('x', '关闭', 'close')}</div><div class="sheet-content">${body}</div>`;
    if (!wasOpen) sheet.showModal();
    if (samePage && content()) content()!.scrollTop = scroll;
    if (wasOpen && !samePage) animate();
  }
  function close() {
    if (!sheet.open) return;
    stopTransition();
    stack.length = 0; key = null; sheet.close();
    focus(returnFocus); returnFocus = null;
  }
  function back() {
    const previous = stack.pop();
    if (!previous) { close(); return; }
    stopTransition();
    key = previous.key; sheet.className = previous.className;
    sheet.setAttribute('aria-label', previous.label);
    sheet.replaceChildren(...previous.nodes); helpers.restored();
    if (content()) content()!.scrollTop = previous.scroll;
    focus(previous.focus); animate();
  }
  return { open, close, back };
}

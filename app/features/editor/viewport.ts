export function installViewport() {
  const viewport = window.visualViewport;
  const update = () => {
    const root = document.documentElement;
    root.style.setProperty('--viewport-height', (viewport?.height || innerHeight) + 'px');
    root.style.setProperty('--viewport-top', (viewport?.offsetTop || 0) + 'px');
    const keyboard = innerHeight - (viewport?.height || innerHeight) > 100;
    root.classList.toggle('keyboard-open', keyboard);
    const selection = getSelection();
    const editable = selection?.anchorNode?.parentElement?.closest('[contenteditable]');
    if (!editable || document.activeElement !== editable || !selection?.rangeCount) return;
    requestAnimationFrame(() => {
      const scroll = editable.closest<HTMLElement>('.editor-scroll');
      if (!scroll) return;
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      const bounds = scroll.getBoundingClientRect();
      if (rect.bottom > bounds.bottom - 24) scroll.scrollTop += rect.bottom - bounds.bottom + 24;
      else if (rect.top < bounds.top + 16) scroll.scrollTop += rect.top - bounds.top - 16;
    });
  };
  viewport?.addEventListener('resize', update);
  viewport?.addEventListener('scroll', update);
  window.addEventListener('resize', update);
  update();
}

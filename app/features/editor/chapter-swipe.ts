/** Horizontal swipes reveal deletion; vertical gestures keep normal scrolling. */
export function enableChapterSwipe(list: HTMLElement) {
  for (const item of list.querySelectorAll<HTMLElement>('.chapter-swipe')) {
    const row = item.querySelector<HTMLButtonElement>('.chapter-row')!;
    let gesture: { id: number; x: number; y: number; open: boolean; horizontal: boolean } | undefined;
    let suppressClick = false;
    row.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      suppressClick = false;
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, open: item.classList.contains('swiped'), horizontal: false };
    });
    row.addEventListener('pointermove', event => {
      if (!gesture || gesture.id !== event.pointerId) return;
      const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
      if (!gesture.horizontal) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { gesture = undefined; return; }
        if (Math.abs(dx) < 12 || Math.abs(dx) <= Math.abs(dy)) return;
        gesture.horizontal = true;
        suppressClick = true;
        row.setPointerCapture(event.pointerId);
      }
      item.classList.toggle('swiped', dx < -35 || (gesture.open && dx < 35));
      if (item.classList.contains('swiped')) {
        list.querySelectorAll('.swiped').forEach(other => { if (other !== item) other.classList.remove('swiped'); });
      }
    });
    const finish = () => { gesture = undefined; };
    row.addEventListener('pointerup', finish);
    row.addEventListener('pointercancel', finish);
    row.addEventListener('click', event => {
      if (!suppressClick && !item.classList.contains('swiped')) return;
      event.preventDefault();
      event.stopPropagation();
      if (!suppressClick) item.classList.remove('swiped');
      suppressClick = false;
    });
  }
}

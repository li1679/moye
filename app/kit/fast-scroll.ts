const HANDLE_HEIGHT = 44;

export function attachFastScroll(target: HTMLElement | Window): () => void {
  const handle = document.createElement('div');
  handle.className = 'fast-scroll';
  handle.setAttribute('aria-hidden', 'true');
  (target instanceof Window ? document.body : target).append(handle);

  let fadeTimer: ReturnType<typeof setTimeout> | undefined;
  let frame = 0;
  let dragging = false;

  const metrics = () => {
    if (target instanceof Window) {
      const root = document.scrollingElement ?? document.documentElement;
      return { top: 0, right: 0, height: innerHeight, scrollTop: scrollY, scrollHeight: root.scrollHeight, clientHeight: innerHeight };
    }
    const rect = target.getBoundingClientRect();
    return { top: rect.top, right: innerWidth - rect.right, height: rect.height, scrollTop: target.scrollTop, scrollHeight: target.scrollHeight, clientHeight: target.clientHeight };
  };

  const update = (show = true) => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const value = metrics();
      const maximum = Math.max(0, value.scrollHeight - value.clientHeight);
      const travel = Math.max(0, value.height - HANDLE_HEIGHT);
      handle.hidden = maximum <= 0;
      handle.style.right = `${Math.max(0, value.right)}px`;
      handle.style.top = `${value.top + HANDLE_HEIGHT / 2 + (maximum ? value.scrollTop / maximum * travel : 0)}px`;
      if (!show || maximum <= 0) return;
      handle.classList.add('visible');
      clearTimeout(fadeTimer);
      if (!dragging) fadeTimer = setTimeout(() => handle.classList.remove('visible'), 1200);
    });
  };

  const setFromPointer = (clientY: number) => {
    const value = metrics();
    const maximum = Math.max(0, value.scrollHeight - value.clientHeight);
    const travel = Math.max(1, value.height - HANDLE_HEIGHT);
    const ratio = Math.max(0, Math.min(1, (clientY - value.top - HANDLE_HEIGHT / 2) / travel));
    if (target instanceof Window) scrollTo(0, maximum * ratio);
    else target.scrollTop = maximum * ratio;
    update();
  };

  const pointerDown = (event: PointerEvent) => {
    dragging = true;
    clearTimeout(fadeTimer);
    handle.classList.add('visible');
    handle.setPointerCapture(event.pointerId);
    setFromPointer(event.clientY);
    event.preventDefault();
  };
  const pointerMove = (event: PointerEvent) => {
    if (dragging && handle.hasPointerCapture(event.pointerId)) setFromPointer(event.clientY);
  };
  const pointerEnd = (event: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    update();
  };
  const onScroll = () => update();
  const onResize = () => update(false);

  target.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);
  handle.addEventListener('pointerdown', pointerDown);
  handle.addEventListener('pointermove', pointerMove);
  handle.addEventListener('pointerup', pointerEnd);
  handle.addEventListener('pointercancel', pointerEnd);
  update(false);

  return () => {
    clearTimeout(fadeTimer);
    cancelAnimationFrame(frame);
    target.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    handle.removeEventListener('pointerdown', pointerDown);
    handle.removeEventListener('pointermove', pointerMove);
    handle.removeEventListener('pointerup', pointerEnd);
    handle.removeEventListener('pointercancel', pointerEnd);
    handle.remove();
  };
}

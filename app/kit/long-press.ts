type LongPressHandler = (target: HTMLElement, event: PointerEvent) => void;

export function onLongPress(
  root: Element,
  selector: string,
  handler: LongPressHandler,
  ms = 500,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: { pointerId: number; x: number; y: number; target: HTMLElement; event: PointerEvent } | null = null;
  let suppressClick: HTMLElement | null = null;

  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    active = null;
  };
  const pointerDown = (raw: Event) => {
    if (!(raw instanceof PointerEvent)) return;
    const event = raw;
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const source = event.target instanceof Element ? event.target.closest<HTMLElement>(selector) : null;
    if (!source || !root.contains(source)) return;
    cancel();
    active = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, target: source, event };
    timer = setTimeout(() => {
      if (!active) return;
      suppressClick = active.target;
      handler(active.target, active.event);
      timer = undefined;
    }, ms);
  };
  const pointerMove = (raw: Event) => {
    if (!(raw instanceof PointerEvent)) return;
    const event = raw;
    if (!active || active.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - active.x, event.clientY - active.y) > 8) cancel();
  };
  const pointerEnd = (raw: Event) => {
    if (!(raw instanceof PointerEvent)) return;
    const event = raw;
    if (active?.pointerId === event.pointerId) cancel();
  };
  const click = (event: Event) => {
    if (!suppressClick || !(event.target instanceof Node) || !suppressClick.contains(event.target)) return;
    suppressClick = null;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  root.addEventListener('pointerdown', pointerDown);
  root.addEventListener('pointermove', pointerMove);
  root.addEventListener('pointerup', pointerEnd);
  root.addEventListener('pointercancel', pointerEnd);
  root.addEventListener('click', click, true);
  return () => {
    cancel();
    suppressClick = null;
    root.removeEventListener('pointerdown', pointerDown);
    root.removeEventListener('pointermove', pointerMove);
    root.removeEventListener('pointerup', pointerEnd);
    root.removeEventListener('pointercancel', pointerEnd);
    root.removeEventListener('click', click, true);
  };
}

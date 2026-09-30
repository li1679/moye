import { editorText } from './dom-text';
import type { Anchor, SelectionPosition } from '../../data/schema';

function offsetRange(element: HTMLElement, start: number, end = start): Range {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  const point = (offset: number): [Node, number] => {
    for (const node of nodes) {
      if (offset <= node.length) return [node, Math.max(0, offset)];
      offset -= node.length;
    }
    return nodes.length ? [nodes[nodes.length - 1], nodes[nodes.length - 1].length] : [element, 0];
  };
  const range = document.createRange();
  range.setStart(...point(start));
  range.setEnd(...point(end));
  return range;
}

export function captureAnchor(element: HTMLElement, scroll: HTMLElement): Anchor {
  const text = element.textContent || '';
  const target = scroll.getBoundingClientRect().top + 12;
  // Reader bodies are plain text; binary search locates the first visible line.
  let low = 0, high = text.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const rect = offsetRange(element, mid, Math.min(mid + 1, text.length)).getBoundingClientRect();
    if (rect.bottom < target) low = mid + 1; else high = mid;
  }
  const rect = offsetRange(element, low, Math.min(low + 1, text.length)).getBoundingClientRect();
  return { offset: low, context: text.slice(low, low + 40), y: rect.top - scroll.getBoundingClientRect().top };
}

export function restoreAnchor(element: HTMLElement, scroll: HTMLElement, anchor: Anchor): boolean {
  const text = element.textContent || '';
  let offset = Math.min(anchor.offset, text.length);
  let exact = text.slice(offset, offset + anchor.context.length) === anchor.context;
  if (!exact && anchor.context) {
    const nearby = text.slice(Math.max(0, offset - 10000), offset + 10000).indexOf(anchor.context);
    if (nearby >= 0) { offset = Math.max(0, offset - 10000) + nearby; exact = true; }
  }
  const rect = offsetRange(element, offset, Math.min(offset + 1, text.length)).getBoundingClientRect();
  if (rect.height) scroll.scrollTop += rect.top - scroll.getBoundingClientRect().top - anchor.y;
  return exact;
}

export function captureSelection(element: HTMLElement, field: SelectionPosition['field']): SelectionPosition | null {
  const selection = getSelection();
  if (!selection?.rangeCount || !element.contains(selection.anchorNode) || !element.contains(selection.focusNode)) return null;
  const range = selection.getRangeAt(0);
  const lengthTo = (node: Node, offset: number) => {
    if (node.nodeType === Node.TEXT_NODE && element.childNodes.length === 1 && node.parentNode === element) return offset;
    const prefix = document.createRange();
    prefix.selectNodeContents(element);
    prefix.setEnd(node, offset);
    const holder = document.createElement('div');
    holder.append(prefix.cloneContents());
    return editorText(holder).length;
  };
  return {
    start: lengthTo(range.startContainer, range.startOffset),
    end: lengthTo(range.endContainer, range.endOffset),
    backward: selection.anchorNode === range.endContainer && selection.anchorOffset === range.endOffset,
    field,
  };
}

export function restoreSelection(element: HTMLElement, position: SelectionPosition, focus = false) {
  if (focus) element.focus({ preventScroll: true });
  const range = offsetRange(element, position.start, position.end);
  const selection = getSelection();
  selection?.setBaseAndExtent(
    position.backward ? range.endContainer : range.startContainer,
    position.backward ? range.endOffset : range.startOffset,
    position.backward ? range.startContainer : range.endContainer,
    position.backward ? range.startOffset : range.endOffset,
  );
}

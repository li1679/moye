// contenteditable uses DIV/P blocks and BR placeholders. innerText can count
// both the block boundary and placeholder BR, introducing an extra empty line.
export function editorText(root: HTMLElement): string {
  function read(parent: Node): string {
    let text = '';
    const children = parent.childNodes;
    for (let index = 0; index < children.length; index++) {
      const node = children[index];
      if (node.nodeType === Node.TEXT_NODE) { text += node.textContent || ''; continue; }
      if (!(node instanceof HTMLElement)) continue;
      if (node.tagName === 'BR') {
        if (children.length !== 1) text += '\n';
        continue;
      }
      const block = node.tagName === 'DIV' || node.tagName === 'P';
      if (block && index > 0) text += '\n';
      text += read(node);
      if (block && index + 1 < children.length && children[index + 1].nodeType === Node.TEXT_NODE) text += '\n';
    }
    return text;
  }
  return read(root);
}

/** Map an editorText UTF-16 offset back to a DOM text position. */
export function editorTextPoint(root: HTMLElement, target: number): { node: Text; offset: number } | null {
  let position = 0;
  let last: Text | null = null;
  function visit(parent: Node): { node: Text; offset: number } | null {
    const children = parent.childNodes;
    for (let index = 0; index < children.length; index++) {
      const node = children[index];
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node as Text;
        last = text;
        const length = text.data.length;
        if (target <= position + length) return { node: text, offset: Math.max(0, target - position) };
        position += length;
        continue;
      }
      if (!(node instanceof HTMLElement)) continue;
      if (node.tagName === 'BR') {
        if (children.length !== 1) position++;
        continue;
      }
      const block = node.tagName === 'DIV' || node.tagName === 'P';
      if (block && index > 0) position++;
      const found = visit(node);
      if (found) return found;
      if (block && index + 1 < children.length && children[index + 1].nodeType === Node.TEXT_NODE) position++;
    }
    return null;
  }
  const found = visit(root);
  const tail = last as Text | null;
  return found ?? (tail ? { node: tail, offset: tail.data.length } : null);
}

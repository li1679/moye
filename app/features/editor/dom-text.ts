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

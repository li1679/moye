import { esc } from '../core/dom';

export const icon = (name: string) => `<i data-lucide="${name}"></i>`;
export const ib = (name: string, label: string, action: string, extra = '') =>
  `<button class="icon" aria-label="${esc(label)}" title="${esc(label)}" data-action="${action}" ${extra}>${icon(name)}</button>`;
export const toolMenu = (items: readonly (readonly (string | boolean)[])[]) =>
  `<div class="tool-grid">${items.map(([i, n, a, d]) => `<button class="tool-item ${d ? 'danger' : ''}" data-action="${a}"><span class="tool-bubble">${icon(String(i))}</span><span>${String(n)}</span></button>`).join('')}</div>`;

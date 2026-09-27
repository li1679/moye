import { esc } from '../core/dom';

export const icon = (name: string) => `<i data-lucide="${name}"></i>`;
export const ib = (name: string, label: string, action: string, extra = '') =>
  `<button class="icon" aria-label="${esc(label)}" title="${esc(label)}" data-action="${action}" ${extra}>${icon(name)}</button>`;
export const toolMenu = (items: readonly (readonly (string | boolean)[])[]) =>
  `<div class="tool-grid">${items.map(([i, n, a, d]) => `<button class="tool-item ${d ? 'danger' : ''}" data-action="${a}"><span class="tool-bubble">${icon(String(i))}</span><span>${String(n)}</span></button>`).join('')}</div>`;

export const cover = (b: { tone?: string; image?: string; name: string; author?: string }) =>
  `<div class="cover ${b.tone || ""} ${b.image ? "has-image" : ""}">${b.image ? `<img src="${b.image}" alt="${esc(b.name)}封面">` : `<strong>${esc(b.name)}</strong><small>${esc(b.author || "未署名")} 著</small>`}</div>`;

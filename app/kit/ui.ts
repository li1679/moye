import type { ToolId } from '../data/schema';
import { esc } from '../core/dom';

export const icon = (name: string) => `<i data-lucide="${name}"></i>`;
export const ib = (name: string, label: string, action: string, extra = '') =>
  `<button class="icon" aria-label="${esc(label)}" title="${esc(label)}" data-action="${action}" ${extra}>${icon(name)}</button>`;
export const toolMenu = (items: readonly (readonly (string | boolean)[])[]) =>
  `<div class="tool-grid">${items.map(([i, n, a, d]) => `<button class="tool-item ${d ? 'danger' : ''}" data-action="${a}"><span class="tool-bubble">${icon(String(i))}</span><span>${String(n)}</span></button>`).join('')}</div>`;

export const cover = (b: { tone?: string; image?: string; name: string; author?: string }) =>
  `<div class="cover ${b.tone || ""} ${b.image ? "has-image" : ""}">${b.image ? `<img src="${b.image}" alt="${esc(b.name)}封面">` : `<strong>${esc(b.name)}</strong><small>${esc(b.author || "未署名")} 著</small>`}</div>`;

// 工具栏按钮的图标与名称（编辑器工具栏、页面布局共用）。
export const tools: Record<ToolId, readonly [string, string]> = {
  copy: ["copy", "拷贝正文"],
  format: ["pilcrow", "一键排版"],
  undo: ["undo-2", "撤销"],
  redo: ["redo-2", "重做"],
  directory: ["list-tree", "目录"],
  settings: ["settings", "界面设置"],
  keyboard: ["keyboard", "收起键盘"],
  find: ["text-search", "查找替换"],
  top: ["arrow-up-to-line", "滚动顶部"],
  bottom: ["arrow-down-to-line", "滚动底部"],
  previous: ["arrow-left-to-line", "上一章"],
  next: ["arrow-right-to-line", "下一章"],
};

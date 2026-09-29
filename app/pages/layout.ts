import { $ } from '../core/dom';
import { icon, ib, tools } from '../kit/ui';
import { TOOL_IDS } from '../data/schema';
import type { ActionHandler, Ctx, PageModule } from '../core/context';

// 页面布局编辑（2.8 从 prototype.js 拆出）：工具栏槽位的渲染与选择、增删、重置、完成。

// 槽位动作的 where 参数只有 top/bottom 两个值；其他值视为无效动作忽略。
function isSide(where: string | undefined): where is 'top' | 'bottom' {
  return where === 'top' || where === 'bottom';
}

export function createLayoutPage(ctx: Ctx): PageModule {
  const state = ctx.state;

  function layoutSettings() {
    state.layoutScroll = $(".editor-scroll")?.scrollTop || 0;
    state.layout = true;
    ctx.closeSheet();
    ctx.render();
  }

  function layoutToolbar(where: 'top' | 'bottom') {
    return `<div class="layout-slots" aria-label="${where === "top" ? "上方" : "下方"}工具栏">${state.toolbars[where].map((id, index) => `<div class="layout-slot">${ib(id ? tools[id][0] : "circle-plus", id ? `更换${tools[id][1]}` : `添加${where === "top" ? "上方" : "下方"}第${index + 1}个工具`, `slot:${where}:${index}`)}${id ? `<button class="slot-remove" aria-label="移除${tools[id][1]}" title="移除${tools[id][1]}" data-action="remove-tool:${where}:${index}">${icon("circle-minus")}</button>` : ""}</div>`).join("")}${ib("plus", "增加工具位置", `add-slot:${where}`)}</div>`;
  }

  function renderLayout() {
    ctx.app.innerHTML = `<main class="app-shell editor layout-editor"><header class="layout-header">${ib("chevron-left", "完成布局", "finish-layout")}<span>页面布局</span><button class="text-action" data-action="reset-layout">重置</button><button class="text-action" data-action="finish-layout">完成</button></header><div class="layout-top">${layoutToolbar("top")}</div><div class="layout-blank" aria-label="正文预留区域"></div><div class="layout-bottom">${layoutToolbar("bottom")}</div></main>`;
  }

  function slotPicker(where: 'top' | 'bottom', index: number) {
    state.activeSlot = { where, index };
    const current = state.toolbars[where][index];
    ctx.openSheet(
      "选择工具",
      `<div class="tool-grid">${Object.entries(tools)
        .map(
          ([id, [i, n]]) =>
            `<button class="tool-item ${current === id ? "chosen-tool" : ""}" data-action="choose-tool:${id}"><span class="tool-bubble">${icon(i)}</span><span>${n}</span>${current === id ? "<small>当前位置</small>" : ""}</button>`,
        )
        .join("")}</div>`,
      { className: "tool-picker" },
    );
  }

  const actions: Record<string, ActionHandler> = {
    layout: layoutSettings,
    'reset-layout'() {
      state.toolbars = {
        top: ["copy", "format", "undo", "redo", "directory", "settings"],
        bottom: ["keyboard", "find", "top", "bottom", null, null],
      };
      ctx.closeSheet();
      ctx.render();
    },
    'finish-layout'() {
      state.layout = false;
      ctx.closeSheet();
      ctx.render();
      $(".editor-scroll").scrollTop = state.layoutScroll ?? 0;
    },
    slot(arg, arg2) {
      if (!isSide(arg) || arg2 === undefined) return;
      slotPicker(arg, Number(arg2));
    },
    'remove-tool'(arg, arg2) {
      if (!isSide(arg) || arg2 === undefined) return;
      state.toolbars[arg][Number(arg2)] = null;
      ctx.render();
    },
    'add-slot'(arg) {
      if (!isSide(arg)) return;
      state.toolbars[arg].push(null);
      ctx.render();
      slotPicker(arg, state.toolbars[arg].length - 1);
    },
    'choose-tool'(arg) {
      const active = state.activeSlot;
      const id = TOOL_IDS.find(tool => tool === arg);
      // choose-tool 只由 slotPicker 打开的面板触发，activeSlot 必已设置。
      if (!active || id === undefined) return;
      const { where, index } = active;
      for (const side of ['top', 'bottom'] as const)
        state.toolbars[side] = state.toolbars[side].map(tool =>
          tool === id ? null : tool,
        );
      state.toolbars[where][index] = id;
      ctx.closeSheet();
      ctx.render();
    },
  };

  return { actions, render: renderLayout };
}

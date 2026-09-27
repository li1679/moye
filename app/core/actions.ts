import { $ } from './dom';
import type { ActionHandler, Ctx, PageModule } from './context';

// 全部动作的注册表。各页面模块把自己的 actions 合并进来；dispatch 只查这张表。
const actions: Record<string, ActionHandler> = {};

export function registerActions(module: PageModule): void {
  Object.assign(actions, module.actions);
}

// 动作分派：切换页面或跳转前先销毁编辑/阅读会话，再按动作名查表执行。
export function createDispatcher(ctx: Ctx) {
  return async function dispatch(a: string): Promise<void> {
    const [kind, arg, arg2, arg3] = a.split(':');
    if (['tab', 'home', 'book', 'chapters', 'chapter', 'jump-chapter', 'match-hit'].includes(kind) && !(kind === 'match-hit' && $('#replacement'))) {
      ctx.dispose();
    }
    const handler = Object.prototype.hasOwnProperty.call(actions, kind) ? actions[kind] : null;
    if (handler) await handler(arg, arg2, arg3, a);
  };
}

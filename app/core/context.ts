import type { AppState } from './state';
import type { Book, Chapter } from '../data/schema';
import type { SheetOptions } from '../ui/sheets';
import type { ToastAction } from './toast';
import type { createSettings } from '../ui/settings';
import type { createTxtFlows } from '../features/txt/flows';
import type { createBackupFlows } from '../features/backup/flows';
import type { mountReader } from '../features/reader/continuous';

export type ActionHandler = (arg?: string, arg2?: string, arg3?: string, raw?: string) => void | Promise<void>;
export type PageModule = { actions: Record<string, ActionHandler>; install?(): void; render?(): void };
export type ReaderSession = ReturnType<typeof mountReader>;

export interface Ctx {
  state: AppState;
  app: HTMLElement;
  sheet: HTMLDialogElement;
  render(): void;
  dispose(): void;                  // 离开编辑或阅读之前调用
  onDispose(fn: () => void): void;  // 各模块登记自己的清理函数
  action(name: string): Promise<void>;
  openSheet(title: string, body: string, options?: SheetOptions): void;
  closeSheet(): void;
  backSheet(): void;
  toast(message: string, action?: ToastAction): void;
  book(): Book | undefined;
  chapter(): Chapter | undefined;
  // 跨模块的能力，由组装入口在各模块创建之后填入：
  // focus:false 只更新高亮和滚动，不改变正文焦点或文档选区。
  editor: { commitBody(value: string, target?: Chapter): void; locateText(offset: number, length?: number, options?: { focus?: boolean; selector?: string }): void };
  reader: { session(): ReaderSession | null };
  txt: ReturnType<typeof createTxtFlows>;
  backup: ReturnType<typeof createBackupFlows>;
  settings: ReturnType<typeof createSettings>;
}

type CtxDeps = Omit<Ctx, 'render' | 'action' | 'dispose' | 'onDispose'>;

// 组装入口先把现成的能力交给 ctx；render 和 action 分别由 router 和动作表装配上去。
export function createCtx(deps: CtxDeps): Ctx {
  const disposeFns: (() => void)[] = [];
  return {
    ...deps,
    render: () => {},
    action: async () => {},
    dispose() {
      const fns = disposeFns.splice(0);
      for (const fn of fns) fn();
    },
    onDispose(fn) { disposeFns.push(fn); },
  };
}

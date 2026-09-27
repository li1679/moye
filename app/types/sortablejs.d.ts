// sortablejs 没有自带类型；这里只声明墨页用到的构造和 destroy。
// 不新增 @types 依赖（CLAUDE.md：不新增第三方依赖）。
declare module 'sortablejs' {
  type SortableOptions = {
    draggable?: string;
    handle?: string;
    animation?: number;
    forceFallback?: boolean;
    fallbackTolerance?: number;
    ghostClass?: string;
    delay?: number;
    delayOnTouchOnly?: boolean;
    touchStartThreshold?: number;
    onEnd?: () => void;
    [key: string]: unknown;
  };
  export default class Sortable {
    constructor(element: HTMLElement, options?: SortableOptions);
    destroy(): void;
  }
}

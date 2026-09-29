import { emptyLibrary, DEFAULT_SESSION, type Library, type Session } from '../data/schema';

/** 应用状态：书库数据（schema 的 Library）+ 会话的 5 个键 + 界面状态。 */
export type AppState = Library & Session & {
  batch: boolean;                    // 书架管理模式
  selected: Set<number>;             // 书架批量管理选中的书 id
  chapterBatch: boolean;             // 章节管理模式
  selectedChapters: Set<Library['books'][number]['chapters'][number]>;   // 选中的章节对象
  settingTab: string;                // 设置面板的标签页
  layout: boolean;                   // 页面布局编辑中
  readerControls: boolean;           // 阅读器控制栏是否显示
  // 以下为只存在内存里的界面临时状态，不保存
  activeGroup?: number;
  activeSlot?: { where: 'top' | 'bottom'; index: number };
  directoryReverse?: boolean;
  layoutScroll?: number;
};

export function createInitialState(): AppState {
  return {
    batch: false,
    selected: new Set(),
    chapterBatch: false,
    selectedChapters: new Set(),
    settingTab: '版面',
    layout: false,
    readerControls: false,
    ...emptyLibrary(),
    ...DEFAULT_SESSION,
  };
}

// 全书排版、全书替换的短时撤销：只存在内存里，离开这本书就失效（D-03）。
export type BookChange = { chapterId: string; before: string; after: string };
export type BookUndoEntry = { bookId: number; label: '全书排版' | '全书替换'; changes: BookChange[] };

let entry: BookUndoEntry | null = null;
export function rememberBookChange(next: BookUndoEntry) { entry = next; }
export function currentBookUndo() { return entry; }
export function pendingBookUndo(bookId: number) { return entry?.bookId === bookId ? entry : null; }
export function takeBookUndo(bookId: number) { const found = pendingBookUndo(bookId); entry = null; return found; }
export function clearBookUndo() { entry = null; }

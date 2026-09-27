import type { EditableChapter } from '../../domain/types';

export type { EditableChapter } from '../../domain/types';
type Field = 'name' | 'body';
type Edit = { field: Field; offset: number; before: string; after: string; sequence: number };
type History = { undo: Edit[]; redo: Edit[] };
export type HistoryHint = { offset: number; before: string; after: string };

const HISTORY_LIMIT = 100;
const HISTORY_BYTES_LIMIT = 32 * 1024 * 1024;

export class ChapterHistory {
  private histories = new Map<string, History>();
  private active = new Map<Edit, History>();
  private sequence = 0;
  private bytes = 0;

  canApply(chapter: EditableChapter, direction: 'undo' | 'redo'): boolean {
    return !!(chapter.id && this.histories.get(chapter.id)?.[direction].length);
  }

  private get(chapter: EditableChapter) {
    chapter.id ??= crypto.randomUUID();
    let history = this.histories.get(chapter.id);
    if (!history) { history = { undo: [], redo: [] }; this.histories.set(chapter.id, history); }
    return history;
  }

  private size(edit: Edit) { return 2 * (edit.before.length + edit.after.length); }

  private remove(edit: Edit, list: Edit[]) {
    const index = list.indexOf(edit);
    if (index < 0) return false;
    list.splice(index, 1);
    this.bytes -= this.size(edit);
    this.active.delete(edit);
    return true;
  }

  record(chapter: EditableChapter, field: Field, before: string, after: string, hint?: HistoryHint) {
    if (before === after) return;
    let start = 0, endBefore = before.length, endAfter = after.length;
    // Hints only accelerate finding the delta; actual before/after remain authoritative.
    // Exact native string comparison is still O(n), not a constant-time guarantee.
    if (hint && Number.isInteger(hint.offset) && hint.offset >= 0 &&
        hint.offset + hint.before.length <= before.length &&
        before.slice(hint.offset, hint.offset + hint.before.length) === hint.before &&
        before.slice(0, hint.offset) + hint.after + before.slice(hint.offset + hint.before.length) === after) {
      start = hint.offset;
      endBefore = start + hint.before.length;
      endAfter = start + hint.after.length;
    } else {
      while (start < endBefore && start < endAfter && before[start] === after[start]) start++;
      while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) { endBefore--; endAfter--; }
    }
    const history = this.get(chapter);
    const edit = { field, offset: start, before: before.slice(start, endBefore), after: after.slice(start, endAfter), sequence: ++this.sequence };
    this.clearRedo(history);
    history.undo.push(edit);
    this.active.set(edit, history);
    this.bytes += this.size(edit);
    if (history.undo.length > HISTORY_LIMIT) this.remove(history.undo[0], history.undo);
    this.trim();
  }

  private clearRedo(history: History) {
    for (const edit of history.redo) {
      this.bytes -= this.size(edit);
      this.active.delete(edit);
    }
    history.redo.length = 0;
  }

  private trim() {
    while (this.bytes > HISTORY_BYTES_LIMIT) {
      const oldest = this.active.entries().next().value;
      if (!oldest) break;
      const [edit, history] = oldest;
      // Dropping a redo prerequisite invalidates the subsequent redo chain.
      if (!this.remove(edit, history.undo)) this.clearRedo(history);
    }
  }

  apply(chapter: EditableChapter, direction: 'undo' | 'redo'): { field: Field; offset: number } | null {
    const history = this.get(chapter);
    const from = history[direction];
    const edit = from.at(-1);
    if (!edit) return null;
    const expected = direction === 'undo' ? edit.after : edit.before;
    const replacement = direction === 'undo' ? edit.before : edit.after;
    const value = chapter[edit.field];
    if (value.slice(edit.offset, edit.offset + expected.length) !== expected) throw new Error('正文已发生其他修改，无法应用这条撤销记录');
    chapter[edit.field] = value.slice(0, edit.offset) + replacement + value.slice(edit.offset + expected.length);
    from.pop();
    history[direction === 'undo' ? 'redo' : 'undo'].push(edit);
    return { field: edit.field, offset: edit.offset + replacement.length };
  }
}

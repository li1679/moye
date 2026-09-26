import { persistentFields } from '../../data/autosave';
export type Chapter = { id: string; name: string; body: string; [key: string]: any };
export type Book = { id: number; name: string; author: string; group: number | null; chapters: Chapter[]; [key: string]: any };
export type Entry = { id: string; label: string; date: string; before: Book[]; after: Book[]; reading: Record<string, any>; editing: Record<string, any>; group?: { id: number; name: string } };
export type Library = { books: Book[]; groups: { id: number; name: string }[]; recovery: Entry[]; [key: string]: any };
// Copy JSON data without materializing another full-book JSON string.
export function clone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => item === undefined ? null : clone(item)) as T;
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, clone(item)])) as T;
}
// Recovery entries are immutable snapshots; only the containing array is replaced.
const entrySizes = new WeakMap<object, number>();
export type RecoveryCapacity = { count: number; bytes: number; limitCount: number; limitBytes: number };
export function recoveryCapacity(entries: Entry[]): RecoveryCapacity {
  let bytes = 4 + Math.max(0, entries.length - 1) * 2;
  for (const entry of entries) {
    let size = entrySizes.get(entry);
    if (size === undefined) { size = JSON.stringify(entry).length * 2; entrySizes.set(entry, size); }
    bytes += size;
  }
  return { count: entries.length, bytes, limitCount: 50, limitBytes: 64 * 1024 * 1024 };
}
export function recoveryCapacityLabel(entries: Entry[]): string {
  const capacity = recoveryCapacity(entries);
  return `${capacity.count}/${capacity.limitCount} 条，约 ${(capacity.bytes / 1024 / 1024).toFixed(2)}/${capacity.limitBytes / 1024 / 1024}MiB（剩余约 ${Math.max(0, (capacity.limitBytes - capacity.bytes) / 1024 / 1024).toFixed(2)}MiB）`;
}
function sameValue(left: any, right: any): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && sameValue(left[key], right[key]));
}
export function librarySnapshot(state: Library): Library {
  const result: Record<string, any> = {};
  for (const key of persistentFields) result[key] = clone(state[key] ?? (key === 'recovery' ? [] : key === 'restorePoint' ? null : {}));
  return result as Library;
}
export function checkpoint(state: Library, label: string, before: Book[], after: Book[], group?: { id: number; name: string }) {
  if (!before.length && !group) return;
  if ((state.recovery?.length || 0) >= 50) throw new Error('恢复记录已达到 50 条上限，请先备份并清理旧记录；本次操作未执行。');
  const entry: Entry = {
    id: crypto.randomUUID(), label, date: new Date().toISOString(), before: clone(before), after: clone(after),
    reading: {}, editing: {},
  };
  if (group) entry.group = clone(group);
  for (const book of before) {
    if (state.reading[book.id]) entry.reading[book.id] = clone(state.reading[book.id]);
    for (const chapter of book.chapters) if (state.editing[chapter.id]) entry.editing[chapter.id] = clone(state.editing[chapter.id]);
  }
  const entries = [...(state.recovery || []), entry];
  // Never silently evict a deleted work to make room.
  const capacity = recoveryCapacity(entries);
  if (capacity.count > capacity.limitCount || capacity.bytes > capacity.limitBytes) {
    throw new Error('恢复记录已达到 50 条或 64MiB 上限。请先完整备份，并在恢复记录中清理旧记录；本次操作未执行。');
  }
  state.recovery = entries;
}
export function canRestore(state: Library, entry: Entry) {
  if (entry.group && state.groups.some(group => group.id === entry.group!.id)) return false;
  return entry.before.every(previous => {
    const current = state.books.find(book => book.id === previous.id);
    const after = entry.after.find(book => book.id === previous.id);
    return after ? sameValue(current, after) : !current;
  });
}
export function restoreEntry(state: Library, entry: Entry, asCopy: boolean) {
  if (!asCopy && !canRestore(state, entry)) throw new Error('这本书在操作后已有修改，请恢复为副本，避免覆盖现有内容。');
  const result = librarySnapshot(state);
  if (entry.group && !asCopy) result.groups.push(clone(entry.group));
  const validGroups = new Set(result.groups.map(group => group.id));
  let nextId = Math.max(Date.now(), ...result.books.map(book => book.id + 1));
  for (const original of entry.before) {
    const restored = clone(original);
    if (restored.group !== null && !validGroups.has(restored.group)) restored.group = null;
    if (asCopy) {
      restored.id = nextId++;
      restored.name += '（恢复副本）';
      for (const chapter of restored.chapters) chapter.id = crypto.randomUUID();
      result.books.push(restored);
    } else {
      const index = result.books.findIndex(book => book.id === restored.id);
      if (index >= 0) result.books[index] = restored; else result.books.push(restored);
      if (entry.reading[restored.id]) result.reading[restored.id] = clone(entry.reading[restored.id]);
      Object.assign(result.editing, clone(entry.editing));
    }
  }
  // Keep the source recovery record until the user explicitly removes it.
  return result;
}

function object(value: any): value is Record<string, any> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function requireValue(condition: unknown, message: string): asserts condition { if (!condition) throw new Error('备份无效：' + message); }
export function validateLibrary(value: unknown): asserts value is Library {
  requireValue(object(value), '书库结构错误');
  const pending: object[] = [value];
  const checked = new WeakSet<object>();
  while (pending.length) {
    const item = pending.pop()!;
    if (checked.has(item)) continue;
    checked.add(item);
    for (const key of Object.keys(item)) {
      requireValue(!['__proto__', 'constructor', 'prototype'].includes(key), '包含不允许的字段');
      const child = (item as Record<string, unknown>)[key];
      if (child !== null && typeof child === 'object') pending.push(child);
    }
  }
  requireValue(Array.isArray(value.books) && Array.isArray(value.groups) && Array.isArray(value.recovery), '缺少书籍、分组或恢复记录');
  const groups = new Set<number>();
  for (const group of value.groups) {
    requireValue(object(group) && Number.isSafeInteger(group.id) && typeof group.name === 'string' && !groups.has(group.id), '分组无效或 ID 重复');
    groups.add(group.id);
  }
  const checkBooks = (books: any[], checkGroups: boolean) => {
    const ids = new Set<number>(), chapterIds = new Set<string>();
    for (const book of books) {
      requireValue(object(book) && Number.isSafeInteger(book.id) && !ids.has(book.id) && typeof book.name === 'string' && typeof book.author === 'string' && Array.isArray(book.chapters), '书籍无效或 ID 重复');
      ids.add(book.id);
      requireValue(book.group === null || Number.isSafeInteger(book.group) && (!checkGroups || groups.has(book.group)), '分组引用无效');
      requireValue(!book.image || typeof book.image === 'string' && /^data:image\/(?:png|jpeg|jpg|webp|gif|avif|bmp|svg\+xml);base64,[a-zA-Z0-9+/=\s]+$/.test(book.image), '封面须为内嵌图片');
      for (const chapter of book.chapters) {
        requireValue(object(chapter) && typeof chapter.id === 'string' && chapter.id.length > 0 && !chapterIds.has(chapter.id) && typeof chapter.name === 'string' && typeof chapter.body === 'string', '章节无效或 ID 重复');
        chapterIds.add(chapter.id);
        if (chapter.sourceHeading != null) requireValue(object(chapter.sourceHeading) && typeof chapter.sourceHeading.name === 'string' && typeof chapter.sourceHeading.raw === 'string', '章节来源标题错误');
      }
    }
  };
  checkBooks(value.books, true);
  for (const key of ['prefs', 'readPrefs', 'reading', 'editing', 'toolbars']) requireValue(object(value[key]), '缺少配置：' + key);
  requireValue(['grid', 'list'].includes(value.view), '书架显示方式错误');
  const tools = new Set(['copy','format','undo','redo','directory','settings','keyboard','find','top','bottom','previous','next']);
  for (const key of ['top','bottom']) requireValue(Array.isArray(value.toolbars[key]) && value.toolbars[key].every((tool: unknown) => tool === null || tools.has(String(tool))), '工具栏配置错误');
  for (const preferences of [value.prefs, value.readPrefs]) {
    requireValue(Number.isFinite(Number(preferences.font)) && Number(preferences.font) >= 10 && Number(preferences.font) <= 80, '字号超出范围');
    requireValue(Number.isFinite(Number(preferences.line)) && Number(preferences.line) >= 1 && Number(preferences.line) <= 4, '行距超出范围');
    for (const key of ['paper', 'color']) requireValue(typeof preferences[key] === 'string' && /^#[0-9a-fA-F]{6}$/.test(preferences[key]), '颜色无效');
    for (const key of ['margin', 'bottom']) if (preferences[key] !== undefined) requireValue(Number.isFinite(Number(preferences[key])) && Number(preferences[key]) >= 0 && Number(preferences[key]) <= 500, '边距无效');
  }
  if (value.readPrefs.themes) for (const key of ['day', 'night']) {
    const theme = value.readPrefs.themes[key];
    requireValue(object(theme) && /^#[0-9a-fA-F]{6}$/.test(theme.paper) && /^#[0-9a-fA-F]{6}$/.test(theme.color), '日夜主题无效');
  }
  const checkPositions = (positions: Record<string, any>, reading: boolean) => {
    for (const position of Object.values(positions)) {
      requireValue(object(position) && Number.isFinite(position.scroll) && position.scroll >= 0, '滚动位置无效');
      if (reading) requireValue(Number.isInteger(position.chapter) && position.chapter >= 0 && (position.chapterId === undefined || typeof position.chapterId === 'string'), '阅读章节位置无效');
      if (position.anchor) requireValue(object(position.anchor) && Number.isInteger(position.anchor.offset) && position.anchor.offset >= 0 && typeof position.anchor.context === 'string' && Number.isFinite(position.anchor.y), '文字锚点无效');
      if (position.selection) requireValue(object(position.selection) && ['body','name'].includes(position.selection.field) && Number.isInteger(position.selection.start) && position.selection.start >= 0 && Number.isInteger(position.selection.end) && position.selection.end >= position.selection.start, '编辑选区无效');
    }
  };
  checkPositions(value.reading, true);
  checkPositions(value.editing, false);
  for (const book of value.books) {
    const position = value.reading[book.id];
    if (position && book.chapters.length) requireValue(position.chapter < book.chapters.length && (!position.chapterId || book.chapters.some((chapter: Chapter) => chapter.id === position.chapterId)), '阅读位置引用不存在的章节');
  }
  requireValue(value.recovery.length <= 50, '恢复记录过多');
  const recordIds = new Set<string>();
  for (const entry of value.recovery) {
    requireValue(object(entry) && typeof entry.id === 'string' && !recordIds.has(entry.id) && typeof entry.label === 'string' && typeof entry.date === 'string' && Array.isArray(entry.before) && Array.isArray(entry.after) && object(entry.reading) && object(entry.editing), '恢复记录错误');
    recordIds.add(entry.id);
    if (entry.group) requireValue(object(entry.group) && Number.isSafeInteger(entry.group.id) && typeof entry.group.name === 'string', '历史分组无效');
    checkBooks(entry.before, false);
    checkBooks(entry.after, false);
    checkPositions(entry.reading, true);
    checkPositions(entry.editing, false);
  }
  if (value.restorePoint != null) {
    requireValue(object(value.restorePoint) && value.restorePoint.restorePoint == null, '恢复前书库结构错误');
    validateLibrary(value.restorePoint);
  }
}
const BACKUP_LIMIT = 256 * 1024 * 1024;
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes++;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++; }
    else bytes += 3;
  }
  return bytes;
}
async function digest(text: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function encodeBackup(state: Library) {
  // Validate and capture synchronously before hashing; no mutable references survive the await.
  const data = Object.fromEntries(persistentFields.map(key => [key, state[key] ?? (key === 'recovery' ? [] : key === 'restorePoint' ? null : {})])) as Library;
  validateLibrary(data);
  const payload = JSON.stringify(data);
  if (utf8ByteLength(payload) > BACKUP_LIMIT) throw new Error('备份超过当前 256MiB 上限，请先清理不需要的恢复记录。');
  const encoded = JSON.stringify({ format: 'local-editing-backup', version: 1, created: new Date().toISOString(), sha256: await digest(payload), payload });
  if (utf8ByteLength(encoded) > BACKUP_LIMIT) throw new Error('备份超过当前 256MiB 上限，请先清理不需要的恢复记录。');
  return encoded;
}
export async function decodeBackup(text: string): Promise<{ data: Library; created: string }> {
  requireValue(utf8ByteLength(text) <= BACKUP_LIMIT, '备份超过当前 256MiB 上限');
  const backup = JSON.parse(text);
  requireValue(object(backup) && backup.format === 'local-editing-backup' && backup.version === 1 && typeof backup.payload === 'string', '不是支持的完整备份文件');
  requireValue(await digest(backup.payload) === backup.sha256, '内容校验失败，文件可能已损坏');
  const data = JSON.parse(backup.payload);
  validateLibrary(data);
  return { data, created: String(backup.created) };
}

import { persistentFields } from '../../data/autosave';
export type Chapter = { id: string; name: string; body: string; [key: string]: any };
export type Book = { id: number; name: string; author: string; group: number | null; chapters: Chapter[]; [key: string]: any };
export type Library = { books: Book[]; groups: { id: number; name: string }[]; [key: string]: any };
// Copy JSON data without materializing another full-book JSON string.
export function clone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => item === undefined ? null : clone(item)) as T;
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, clone(item)])) as T;
}
export function librarySnapshot(state: Library): Library {
  const result: Record<string, any> = {};
  for (const key of persistentFields) result[key] = clone(state[key] ?? (key === 'restorePoint' ? null : {}));
  return result as Library;
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
  requireValue(Array.isArray(value.books) && Array.isArray(value.groups), '缺少书籍或分组');
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
  if (value.restorePoint != null) {
    requireValue(object(value.restorePoint) && value.restorePoint.restorePoint == null, '恢复前书库结构错误');
    validateLibrary(value.restorePoint);
  }
}
const BACKUP_LIMIT = 256 * 1024 * 1024;
/** 备份包含的字段（版本 2）：不含 restorePoint。 */
const BACKUP_FIELDS = ['books', 'groups', 'view', 'prefs', 'toolbars', 'reading', 'readPrefs', 'editing'] as const;
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
  const data = Object.fromEntries(BACKUP_FIELDS.map(key => [key, clone(state[key] ?? (key === 'books' || key === 'groups' ? [] : {}))])) as Library;
  validateLibrary(data);
  const payload = JSON.stringify(data);
  if (utf8ByteLength(payload) > BACKUP_LIMIT) throw new Error('备份超过 256MiB 上限。');
  const encoded = JSON.stringify({ format: 'local-editing-backup', version: 2, created: new Date().toISOString(), sha256: await digest(payload), payload });
  if (utf8ByteLength(encoded) > BACKUP_LIMIT) throw new Error('备份超过 256MiB 上限。');
  return encoded;
}
export async function decodeBackup(text: string): Promise<{ data: Library; created: string }> {
  requireValue(utf8ByteLength(text) <= BACKUP_LIMIT, '备份超过当前 256MiB 上限');
  const backup = JSON.parse(text);
  requireValue(object(backup) && backup.format === 'local-editing-backup' && (backup.version === 1 || backup.version === 2) && typeof backup.payload === 'string', '不是支持的完整备份文件');
  requireValue(await digest(backup.payload) === backup.sha256, '内容校验失败，文件可能已损坏');
  const data = JSON.parse(backup.payload);
  // 版本 1 的备份里可能有恢复记录和恢复点；导入时去掉这两项。
  if (backup.version === 1) { delete data.recovery; delete data.restorePoint; }
  validateLibrary(data);
  return { data, created: String(backup.created) };
}

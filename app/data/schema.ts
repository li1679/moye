// 书库数据的唯一定义：类型、默认值、规范化、校验、数据库行格式、版本迁移。
// 规则：新增要保存的字段，先在这里登记，并写明哪个页面读它。

export const SCHEMA_VERSION = 5;

// search 供编辑器“本章查找”工具使用；默认工具栏不放置。
export const TOOL_IDS = ['copy', 'format', 'undo', 'redo', 'directory', 'settings', 'keyboard', 'find', 'search', 'top', 'bottom', 'previous', 'next'] as const;
export type ToolId = (typeof TOOL_IDS)[number];

export type Anchor = { offset: number; context: string; y: number };
export type SelectionPosition = { start: number; end: number; backward: boolean; field: 'body' | 'name' };
export type SourceHeading = { name: string; raw: string };
export type Chapter = { id: string; name: string; body: string; sourceHeading?: SourceHeading | null };

export type Book = {
  id: number;
  name: string;
  author: string;
  description?: string;
  group: number | null;
  chapters: Chapter[];
  image?: string;          // 封面 dataURL。数据库里存成 cover:<id> 行。书架和书籍表单读。
  libraryOrder?: number;   // 书架上的显示顺序。书架读。
  sourceHash?: string;     // 导入文件的 SHA-256。重复导入检测读。
};

export type Group = { id: number; name: string; libraryOrder?: number };

export type Prefs = {
  font: number; line: number; bold: boolean;
  indent: boolean; spaces: boolean; paragraph: '不限' | 0 | 1 | 2 | 3;   // 一键排版规则
  margin: number; bottom: number;
  grid: boolean; near: boolean; thick: boolean; lineType: '实线' | '长虚线' | '短虚线' | '点线'; lineColor: string;
  color: string; paper: string;
  fontFamily: '系统默认' | '宋体' | '黑体';   // 编辑器显示设置读取。
};

export type ReadPrefs = {
  font: number; line: number; margin: number; bottom: number; paper: string; color: string; brightness: number;
  fontFamily: '系统默认' | '宋体' | '黑体';   // 阅读器设置和阅读正文读取。
  tidy: '关' | '紧凑' | '宽松';             // 阅读器显示正文和阅读搜索读取。
  tapPaging: boolean;                           // 阅读器点按上、下区域翻屏时读取。
  keepAwake: boolean; immersive: boolean; brightnessAuto: boolean;
  night?: boolean;
  themes?: { day: { paper: string; color: string }; night: { paper: string; color: string } };
  // 后续批次不再新增阅读偏好字段。
};

export type Toolbars = { top: (ToolId | null)[]; bottom: (ToolId | null)[] };
export type ReadingPosition = { chapter: number; chapterId?: string; scroll: number; anchor?: Anchor; percent?: number; at?: number };   // percent 和 at 给阅读书架显示进度、最近阅读排序用
export type EditingPosition = { scroll: number; selection?: SelectionPosition; anchor?: Anchor };
export type Session = { tab: 'edit' | 'read' | 'me'; page: 'home' | 'chapters' | 'editor' | 'reader'; folder: number | null; book: number | null; chapter: number };

export type Library = {
  books: Book[]; groups: Group[]; view: 'grid' | 'list'; readSort: 'manual' | 'recent';
  prefs: Prefs; toolbars: Toolbars; reading: Record<string, ReadingPosition>; readPrefs: ReadPrefs;
  editing: Record<string, EditingPosition>; restorePoint: Library | null;
};

export const DEFAULT_PREFS: Prefs = {
  font: 20, line: 1.8, bold: false, indent: true, spaces: false, paragraph: '不限', margin: 24, bottom: 80,
  grid: false, near: true, thick: false, lineType: '短虚线', lineColor: '#dadde0',
  color: '#1f1d1a', paper: '#f6f1e7', fontFamily: '系统默认',
};
export const DEFAULT_READ_PREFS: ReadPrefs = { font: 20, line: 1.8, margin: 24, bottom: 80, paper: '#f6f1e7', color: '#1f1d1a', brightness: 100, fontFamily: '系统默认', tidy: '关', tapPaging: true, keepAwake: true, immersive: false, brightnessAuto: true };
export const DEFAULT_TOOLBARS: Toolbars = { top: ['copy', 'format', 'undo', 'redo', 'directory', 'settings'], bottom: ['keyboard', 'find', 'top', 'bottom', null, null] };
export const DEFAULT_SESSION: Session = { tab: 'edit', page: 'home', folder: null, book: null, chapter: 0 };

export function emptyLibrary(): Library {
  return {
    books: [], groups: [], view: 'grid', readSort: 'manual',
    prefs: { ...DEFAULT_PREFS }, toolbars: structuredClone(DEFAULT_TOOLBARS),
    reading: {}, readPrefs: { ...DEFAULT_READ_PREFS }, editing: {}, restorePoint: null,
  };
}

/** 各自存成一行的字段（books 按书、章分行存）。 */
export const FIELD_ROWS = ['groups', 'view', 'readSort', 'prefs', 'toolbars', 'reading', 'readPrefs', 'editing', 'restorePoint'] as const;
/** state 顶层的这 5 个键合起来存成一行 session。 */
export const SESSION_KEYS = ['tab', 'page', 'folder', 'book', 'chapter'] as const;
/** 完整备份包含的字段（不含 restorePoint 和 session）。 */
export const BACKUP_FIELDS = ['books', 'groups', 'view', 'readSort', 'prefs', 'toolbars', 'reading', 'readPrefs', 'editing'] as const;

export type Row = { id: string; value: string };
export const rowId = {
  book: (id: number) => `book:${id}`,
  chapter: (id: string) => `chapter:${id}`,
  cover: (id: number) => `cover:${id}`,
};

export function bookRowValue(book: Book): string {
  const { chapters, image: _image, ...meta } = book;
  return JSON.stringify({ ...meta, chapterIds: chapters.map(chapter => chapter.id) });
}
export const chapterRowValue = (chapter: Chapter): string => JSON.stringify(chapter);
export const coverRowValue = (image: string): string => JSON.stringify(image);

/** 除章节正文之外的全部行；schema 行放在最后。 */
export function metaRows(library: Library, session: Session): Row[] {
  const rows: Row[] = FIELD_ROWS.map(field => ({ id: field, value: JSON.stringify(library[field]) }));
  rows.push({ id: 'session', value: JSON.stringify(session) });
  rows.push({ id: 'book-order', value: JSON.stringify(library.books.map(book => book.id)) });
  for (const book of library.books) {
    // 封面行放在书行前面：迁移是分批提交的，这样即使中途断电，也不会出现"书行已经去掉 image、封面行还没写进去"的情况
    if (book.image) rows.push({ id: rowId.cover(book.id), value: coverRowValue(book.image) });
    rows.push({ id: rowId.book(book.id), value: bookRowValue(book) });
  }
  rows.push({ id: 'schema', value: String(SCHEMA_VERSION) });
  return rows;
}

export function toRows(library: Library, session: Session = DEFAULT_SESSION): Row[] {
  const chapters = library.books.flatMap(book => book.chapters.map(chapter => ({ id: rowId.chapter(chapter.id), value: chapterRowValue(chapter) })));
  return [...chapters, ...metaRows(library, session)];
}

/** 读任意旧版本或当前版本的行。renamedChapters 记下规范化时改过标题的章节，供迁移用。 */
export function fromRows(rows: Map<string, string>) {
  const used = new Set<string>(['schema', 'session', 'book-order', ...FIELD_ROWS]);
  const read = (id: string) => {
    const value = rows.get(id);
    if (value === undefined) throw new Error('数据库缺少记录：' + id);
    used.add(id);
    return JSON.parse(value);
  };
  const optional = (id: string) => (rows.has(id) ? read(id) : undefined);
  const raw: Record<string, unknown> = {};
  for (const field of FIELD_ROWS) raw[field] = optional(field);
  raw.books = ((optional('book-order') ?? []) as number[]).map(id => {
    const { chapterIds, image, ...meta } = read(rowId.book(id));
    const cover = optional(rowId.cover(id)) ?? image;   // 版本 2 存在 cover 行；版本 1 内嵌在书行里
    return { ...meta, ...(cover ? { image: cover } : {}), chapters: (chapterIds as string[]).map(chapterId => read(rowId.chapter(chapterId))) };
  });
  const renamedChapters = new Set<string>();
  const library = normalizeLibrary(raw, renamedChapters);
  const session = normalizeSession(optional('session'), library);
  const orphanRows = [...rows.keys()].filter(id => !used.has(id));   // 包括版本 1 的 recovery 行
  return { library, session, orphanRows, renamedChapters };
}

/** 补默认值，去掉停用的字段和无主数据。可以重复执行。 */
export function normalizeLibrary(raw: any, renamedChapters?: Set<string>): Library {
  const base = emptyLibrary();
  const groups: Group[] = Array.isArray(raw.groups) ? raw.groups.map((group: Group) => ({ ...group })) : [];   // 复制一份：下面补顺序时不改传入的对象
  const groupIds = new Set(groups.map(group => group.id));
  const books: Book[] = (raw.books ?? []).map((book: any) => {
    const { tone: _tone, ...rest } = book;   // tone 已停用：封面按书 id 取色
    return {
      ...rest,
      group: rest.group !== null && groupIds.has(rest.group) ? rest.group : null,
      chapters: rest.chapters.map((chapter: Chapter) => {
        if (!/[\r\n]/.test(chapter.name)) return chapter;
        renamedChapters?.add(chapter.id);
        return { ...chapter, name: chapter.name.replace(/\s*[\r\n]+\s*/g, ' ').trim() };
      }),
    };
  });
  const prefs = { ...base.prefs, ...raw.prefs };
  delete (prefs as Record<string, unknown>).autoScroll;
  delete (prefs as Record<string, unknown>).punctuation;
  const readPrefs = { ...base.readPrefs, ...raw.readPrefs };
  delete (readPrefs as Record<string, unknown>).volumePaging;   // 停用字段不进入运行时状态；本轮不增加旧数据迁移版本。
  const bookIds = new Set(books.map(book => String(book.id)));
  const chapterIds = new Set(books.flatMap(book => book.chapters.map(chapter => chapter.id)));
  const keep = <T>(record: Record<string, T> | undefined, ok: (key: string) => boolean) =>
    Object.fromEntries(Object.entries(record ?? {}).filter(([key]) => ok(key)));
  assignLibraryOrder(books, groups);
  return {
    books, groups,
    view: raw.view === 'list' ? 'list' : 'grid',
    readSort: raw.readSort === 'recent' ? 'recent' : 'manual',
    prefs,
    toolbars: normalizeToolbars(raw.toolbars ?? base.toolbars),   // 未知工具换成 null
    reading: keep(raw.reading, key => bookIds.has(key)),
    readPrefs,
    editing: keep(raw.editing, key => chapterIds.has(key)),
    restorePoint: raw.restorePoint ? { ...normalizeLibrary(raw.restorePoint), restorePoint: null } : null,
  };
}

export function normalizeSession(raw: any, library: Library): Session {
  const session = { ...DEFAULT_SESSION, ...raw };
  const tab: Session['tab'] = ['edit', 'read', 'me'].includes(session.tab) ? session.tab : 'edit';
  const folder = library.groups.some(group => group.id === session.folder) ? session.folder : null;
  const book = library.books.find(item => item.id === session.book);
  let page: Session['page'] = ['home', 'chapters', 'editor', 'reader'].includes(session.page) ? session.page : 'home';
  if (!book || tab === 'me' || (tab === 'read' && page !== 'reader') || (tab === 'edit' && page === 'reader')) page = 'home';
  if (page === 'editor' && !book!.chapters.length) page = 'chapters';
  const last = Math.max(0, (book?.chapters.length ?? 1) - 1);
  const chapter = Math.min(Math.max(0, Number(session.chapter) || 0), last);
  return { tab, page, folder, book: book ? book.id : null, chapter };
}

type Ordered = { libraryOrder?: number };

/** 未知的工具换成 null；整组缺失时用默认值。 */
function normalizeToolbars(raw: any): Toolbars {
  const list = (value: unknown) => Array.isArray(value)
    ? value.map(id => ((TOOL_IDS as readonly string[]).includes(id) ? (id as ToolId) : null))
    : null;
  return { top: list(raw?.top) ?? [...DEFAULT_TOOLBARS.top], bottom: list(raw?.bottom) ?? [...DEFAULT_TOOLBARS.bottom] };
}
function fillOrder(items: Ordered[]) {
  let next = Math.max(-1, ...items.map(item => item.libraryOrder ?? -1)) + 1;
  for (const item of items) if (item.libraryOrder === undefined) item.libraryOrder = next++;
}
/** 和原来书架渲染时的补齐顺序一致：根目录是"分组在前、书在后"，每个分组里只有书。 */
export function assignLibraryOrder(books: Book[], groups: Group[]) {
  fillOrder([...groups, ...books.filter(book => book.group === null)]);
  for (const group of groups) fillOrder(books.filter(book => book.group === group.id));
}
export function nextLibraryOrder(library: { books: { group: number | null; libraryOrder?: number }[]; groups: { libraryOrder?: number }[] }, group: number | null): number {
  const items: Ordered[] = [...(group === null ? library.groups : []), ...library.books.filter(book => book.group === group)];
  return Math.max(-1, ...items.map(item => item.libraryOrder ?? -1)) + 1;
}

/** 把旧版本的行升级到当前版本。只返回需要写入和删除的行，schema 行在 upserts 最后。可以重复执行。 */
export function migrateRows(rows: Map<string, string>): { upserts: Row[]; deletes: string[] } {
  const { library, session, orphanRows, renamedChapters } = fromRows(rows);
  const upserts: Row[] = [];
  for (const book of library.books) for (const chapter of book.chapters) {
    if (renamedChapters.has(chapter.id)) upserts.push({ id: rowId.chapter(chapter.id), value: chapterRowValue(chapter) });
  }
  for (const row of metaRows(library, session)) if (row.id !== 'schema' && rows.get(row.id) !== row.value) upserts.push(row);
  upserts.push({ id: 'schema', value: String(SCHEMA_VERSION) });
  return { upserts, deletes: orphanRows };
}

// Copy JSON data without materializing another full-book JSON string.
export function clone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => item === undefined ? null : clone(item)) as T;
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, clone(item)])) as T;
}

/** 完整书库快照（备份恢复点、快照比较用）：按 BACKUP_FIELDS 加 restorePoint、books 深拷贝。 */
export function snapshotLibrary(state: Library): Library {
  const result: Record<string, unknown> = {};
  for (const key of ['books', ...FIELD_ROWS]) result[key] = clone((state as Record<string, unknown>)[key] ?? (key === 'restorePoint' ? null : Array.isArray((state as Record<string, unknown>)[key]) ? [] : {}));
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
  if (value.readSort !== undefined) requireValue(['manual', 'recent'].includes(value.readSort), '书架排序错误');
  const tools = new Set<string>(TOOL_IDS);
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
      if (reading) {
        requireValue(Number.isInteger(position.chapter) && position.chapter >= 0 && (position.chapterId === undefined || typeof position.chapterId === 'string'), '阅读章节位置无效');
        if (position.percent !== undefined) requireValue(Number.isFinite(position.percent) && position.percent >= 0 && position.percent <= 100, '阅读百分比无效');
        if (position.at !== undefined) requireValue(Number.isFinite(position.at) && position.at >= 0, '阅读时间无效');
      }
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

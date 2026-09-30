import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { openStorage, commitInBatches, type Row } from './storage';
import { emptyLibrary, DEFAULT_SESSION, SCHEMA_VERSION, toRows, fromRows, migrateRows, normalizeLibrary, rowId, bookRowValue, chapterRowValue, coverRowValue, SESSION_KEYS, FIELD_ROWS, type Library, type Chapter, type Book } from './schema';

const persistentFields = ['books', ...FIELD_ROWS];
const fields: readonly string[] = FIELD_ROWS;
type LibraryState = { books: Book[]; [key: string]: unknown };
const replacers = new WeakMap<object, (value: LibraryState) => Promise<void>>();
const savers = new WeakMap<object, () => Promise<void>>();
export function replaceLibrary(state: object, value: LibraryState) { return replacers.get(state)?.(value) ?? Promise.reject(new Error('本地存储尚未初始化')); }
export function saveNow(state: object) { return savers.get(state)?.() ?? Promise.reject(new Error('本地存储尚未初始化')); }

// 跟踪表：只记 id 和对象引用，不存整库的 JSON 副本（E-05：全库在内存里只保留一份）。
type Tracking = {
  ids: Set<string>;                               // 数据库里现有的全部行 id
  order: number[];                                // 上次写入的 book-order
  chapters: Map<number, Map<string, Chapter>>;    // 每本书上次写入的章节：id → 章节对象（只存引用，不复制内容）
  covers: Map<number, string | null>;             // 每本书上次写入的封面（引用同一个字符串，不额外占内存）
};

/** 读库后（或整库替换后）初始化跟踪表：library 里的对象都是原始对象，不是代理。 */
function initTracking(library: Library): Tracking {
  const ids = new Set<string>(['schema', 'session', 'book-order', ...FIELD_ROWS]);
  for (const book of library.books) {
    ids.add(rowId.book(book.id));
    for (const chapter of book.chapters) ids.add(rowId.chapter(chapter.id));
    if (book.image) ids.add(rowId.cover(book.id));
  }
  return {
    ids,
    order: library.books.map(book => book.id),
    chapters: new Map(library.books.map(book => [book.id, new Map(book.chapters.map(chapter => [chapter.id, chapter]))])),
    covers: new Map(library.books.map(book => [book.id, book.image || null])),
  };
}

export async function persistState<T extends LibraryState>(initial: T): Promise<T> {
  const badge = document.createElement('button');
  badge.className = 'save-status'; badge.setAttribute('aria-live', 'polite'); document.body.append(badge);
  const report = (state: 'dirty' | 'saving' | 'saved' | 'failed', message: string, failed = false) => {
    badge.hidden = !failed; badge.textContent = message; badge.dataset.failed = String(failed);
    document.dispatchEvent(new CustomEvent('moye:save-state', { detail: state }));
  };
  report('saving', '正在读取');
  const storage = await openStorage();
  const rows = await storage.read();
  if (!rows.size) {
    const fresh = toRows(emptyLibrary(), DEFAULT_SESSION);
    await commitInBatches(storage, fresh, []);
    for (const row of fresh) rows.set(row.id, row.value);
  } else {
    const schema = rows.get('schema');
    const version = Number(schema);
    if (Number.isInteger(version) && version >= 1 && version < SCHEMA_VERSION) {
      const { upserts, deletes } = migrateRows(rows);
      await commitInBatches(storage, upserts, deletes);
      for (const row of upserts) rows.set(row.id, row.value);
      for (const id of deletes) rows.delete(id);
    } else if (version > SCHEMA_VERSION) {
      throw new Error('数据库版本比当前应用新，请更新墨页后再打开；本机数据未被修改。');
    } else if (schema !== String(SCHEMA_VERSION)) {
      throw new Error('不支持的数据库版本，未覆盖原数据');
    }
  }
  const { library, session, orphanRows } = fromRows(rows);
  if (orphanRows.length) await storage.commit([], orphanRows);
  for (const key of persistentFields) (initial as LibraryState)[key] = (library as unknown as LibraryState)[key];
  for (const key of SESSION_KEYS) (initial as LibraryState)[key] = session[key];
  let tracking = initTracking(library);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | undefined;
  let dirty = false;
  let replacing = false;
  const dirtyFields = new Set<string>();
  const dirtyBooks = new Set<number>();
  const dirtyChapters = new Set<string>();
  let dirtyOrder = false;

  const mark = (kind: 'field' | 'book' | 'chapter' | 'order', value?: string | number) => {
    if (replacing) throw new Error('正在恢复书库，请等待完成');
    dirty = true;
    if (kind === 'field') dirtyFields.add(String(value));
    else if (kind === 'book') dirtyBooks.add(Number(value));
    else if (kind === 'chapter') dirtyChapters.add(String(value));
    else { dirtyOrder = true; }
    report('dirty', '待保存'); clearTimeout(timer); timer = setTimeout(backgroundSave, 350); deadline ??= setTimeout(backgroundSave, 2000);
  };

  /** 只写有变化的行：新书写全部行，删书删全部行，章节列表变化写书行和新章、删旧章，正文变化只写这一章，封面变化只写封面行。 */
  function collectChanges(dirty: { fields: Set<string>; books: Set<number>; chapters: Set<string>; order: boolean }) {
    const upserts = new Map<string, string>();
    const deletes = new Set<string>();
    const next: Tracking = { ids: new Set(tracking.ids), order: tracking.order, chapters: new Map(tracking.chapters), covers: new Map(tracking.covers) };
    const put = (id: string, value: string) => { upserts.set(id, value); deletes.delete(id); next.ids.add(id); };
    const drop = (id: string) => { upserts.delete(id); if (next.ids.has(id)) { deletes.add(id); next.ids.delete(id); } };

    for (const field of dirty.fields) {
      const value = field === 'session' ? Object.fromEntries(SESSION_KEYS.map(key => [key, initial[key]])) : initial[field];
      value === undefined ? drop(field) : put(field, JSON.stringify(value));
    }

    const ids = initial.books.map(book => book.id);
    const current = new Set(ids);
    if (dirty.order || ids.join() !== tracking.order.join()) { put('book-order', JSON.stringify(ids)); next.order = ids; }
    for (const id of tracking.order) if (!current.has(id)) {   // 删掉的书
      drop(rowId.book(id)); drop(rowId.cover(id));
      for (const chapterId of tracking.chapters.get(id)?.keys() ?? []) drop(rowId.chapter(chapterId));
      next.chapters.delete(id); next.covers.delete(id);
    }

    for (const book of initial.books) {
      const known = tracking.chapters.get(book.id);
      const isNew = known === undefined;
      if (!isNew && !dirty.books.has(book.id)) continue;
      for (const chapter of book.chapters) chapter.id ??= crypto.randomUUID();
      put(rowId.book(book.id), bookRowValue(book));
      const before = known ?? new Map<string, Chapter>();
      const now = new Map(book.chapters.map(chapter => [chapter.id, chapter]));
      for (const chapterId of before.keys()) if (!now.has(chapterId)) drop(rowId.chapter(chapterId));
      // 新增的章节，以及"同一个 id 换了一个新对象"的章节，都要写
      for (const chapter of book.chapters) if (before.get(chapter.id) !== chapter) put(rowId.chapter(chapter.id), chapterRowValue(chapter));
      next.chapters.set(book.id, now);
      const image = book.image || null;
      if (isNew || tracking.covers.get(book.id) !== image) {
        image ? put(rowId.cover(book.id), coverRowValue(image)) : drop(rowId.cover(book.id));
        next.covers.set(book.id, image);
      }
    }

    for (const chapterId of dirty.chapters) {
      for (const book of initial.books) {
        const chapter = book.chapters.find(item => item.id === chapterId);
        if (chapter) { put(rowId.chapter(chapterId), chapterRowValue(chapter)); break; }
      }
    }
    return { upserts: [...upserts].map(([id, value]) => ({ id, value }) as Row), deletes: [...deletes], next };
  }

  const flush = (): Promise<void> => {
    clearTimeout(timer); clearTimeout(deadline); deadline = undefined;
    if (running) return running;
    if (!dirty) return Promise.resolve();
    running = (async () => {
      try {
        while (dirty) {
          dirty = false; report('saving', '正在保存');
          // 复制当前的脏集合并清空
          const fieldsToSave = new Set(dirtyFields); dirtyFields.clear();
          const bookIdsToSave = new Set(dirtyBooks); dirtyBooks.clear();
          const chaptersToSave = new Set(dirtyChapters); dirtyChapters.clear();
          const savingOrder = dirtyOrder; dirtyOrder = false;
          const { upserts, deletes, next } = collectChanges({ fields: fieldsToSave, books: bookIdsToSave, chapters: chaptersToSave, order: savingOrder });
          try {
            await storage.commit(upserts, deletes);
            tracking = next;
          } catch (error) {
            for (const field of fieldsToSave) dirtyFields.add(field);
            for (const id of bookIdsToSave) dirtyBooks.add(id);
            for (const chapterId of chaptersToSave) dirtyChapters.add(chapterId);
            dirtyOrder ||= savingOrder; dirty = true; throw error;
          }
          if (dirtyFields.size || dirtyBooks.size || dirtyChapters.size || dirtyOrder) dirty = true;
        }
        report('saved', '已保存');
      } catch (error) { dirty = true; report('failed', '保存失败 · 点击重试', true); badge.title = String(error); console.error('保存失败', error); throw error; }
    })().finally(() => { running = undefined; });
    return running;
  };
  function backgroundSave() { void flush().catch(error => console.error('自动保存未完成，等待重试', error)); }

  const proxyTargets = new WeakMap<object, object>();
  const cache = new WeakMap<object, Map<string, object>>();
  const unwrap = (value: any) => proxyTargets.get(value) ?? value;
  // 护栏（E-02、D-43）：数组里的代理对象拆回原始对象，保证原始数据里不混进代理。
  const unwrapArray = (value: any) => (Array.isArray(value) ? value.map(unwrap) : unwrap(value));
  type Owner = { kind: 'field' | 'book' | 'chapters' | 'chapter' | 'order'; id?: string | number };
  const wrap = (input: any, owner: Owner): any => {
    const value = unwrap(input);
    if (!value || typeof value !== 'object' || value instanceof Set) return value;
    let variants = cache.get(value); if (!variants) { variants = new Map(); cache.set(value, variants); }
    const key = owner.kind + ':' + owner.id;
    if (variants.has(key)) return variants.get(key);
    const proxy = new Proxy(value, {
      get: (target, property) => {
        const child = Reflect.get(target, property);
        if (owner.kind === 'order' && Array.isArray(target) && child && typeof child === 'object') {
          const chapter = child as Book;
          return wrap(child, { kind: 'book', id: chapter.id });
        }
        if (owner.kind === 'book' && property === 'chapters') return wrap(child, { kind: 'chapters', id: owner.id });
        if (owner.kind === 'chapters' && Array.isArray(target) && child && typeof child === 'object') {
          const chapter = child as Chapter;
          chapter.id ??= crypto.randomUUID();
          return wrap(chapter, { kind: 'chapter', id: chapter.id });
        }
        return wrap(child, owner);
      },
      set: (target, property, next) => {
        if (replacing) throw new Error('正在恢复书库，请等待完成');
        const rawNext = unwrapArray(next);
        const previous = Reflect.get(target, property); const result = Reflect.set(target, property, rawNext);
        if (result && unwrap(previous) !== rawNext) {
          if (owner.kind === 'order') mark('order');
          else if (owner.kind === 'chapters') mark('book', owner.id);
          else if (owner.kind === 'chapter') mark('chapter', owner.id);
          else mark(owner.kind, owner.id);
        }
        return result;
      },
      deleteProperty: (target, property) => {
        if (replacing) throw new Error('正在恢复书库，请等待完成');
        const result = Reflect.deleteProperty(target, property);
        if (result) {
          if (owner.kind === 'order') mark('order');
          else if (owner.kind === 'chapters') mark('book', owner.id);
          else if (owner.kind === 'chapter') mark('chapter', owner.id);
          else mark(owner.kind, owner.id);
        }
        return result;
      },
    });
    proxyTargets.set(proxy, value); variants.set(key, proxy); return proxy;
  };
  const state = new Proxy(initial, {
    get: (target, key) => { const value = Reflect.get(target, key); return key === 'books' ? wrap(value, { kind: 'order' }) : fields.includes(String(key)) ? wrap(value, { kind: 'field', id: String(key) }) : value; },
    set: (target, key, value) => {
      if (replacing) throw new Error('正在恢复书库，请等待完成');
      const rawValue = unwrapArray(value);
      const previous = Reflect.get(target, key);
      const result = Reflect.set(target, key, rawValue);
      if (result && unwrap(previous) !== rawValue) {
        if (key === 'books') mark('order');
        else if (fields.includes(String(key))) mark('field', String(key));
        else if ((SESSION_KEYS as readonly string[]).includes(String(key))) mark('field', 'session');
      }
      return result;
    },
    deleteProperty: (target, key) => {
      if (replacing) throw new Error('正在恢复书库，请等待完成');
      if (key === 'books') throw new Error('书库不能为空，请使用空数组清空书库');
      const existed = Object.prototype.hasOwnProperty.call(target, key);
      const result = Reflect.deleteProperty(target, key);
      if (result && existed && fields.includes(String(key))) mark('field', String(key));
      return result;
    },
  });
  savers.set(state, flush);
  replacers.set(state, async value => {
    if (replacing) throw new Error('正在恢复书库，请等待完成');
    replacing = true;
    clearTimeout(timer); clearTimeout(deadline); deadline = undefined;
    try {
      await flush();
      // 必须先规范化：版本 1 的备份里没有 readSort 这类新字段。
      const library = normalizeLibrary(value);
      const rows = toRows(library, DEFAULT_SESSION);
      const next = new Map(rows.map(row => [row.id, row.value]));
      await storage.commit(rows, [...tracking.ids].filter(id => !next.has(id)));
      for (const key of persistentFields) (initial as LibraryState)[key] = (library as unknown as LibraryState)[key];
      for (const key of SESSION_KEYS) (initial as LibraryState)[key] = DEFAULT_SESSION[key];
      tracking = initTracking(library);
      dirty = false;
      dirtyFields.clear(); dirtyBooks.clear(); dirtyChapters.clear();
      dirtyOrder = false;
    } finally { replacing = false; }
    // 恢复备份的流程随后会 location.reload()，重新读库，session 是默认值，所以回到写作书架。
    report('saved', '已保存');
  });
  badge.onclick = backgroundSave;
  document.addEventListener('visibilitychange', () => { if (document.hidden) backgroundSave(); });
  document.addEventListener('click', backgroundSave); window.addEventListener('pagehide', backgroundSave);
  window.addEventListener('beforeunload', event => { if (dirty || running || replacing) { event.preventDefault(); event.returnValue = ''; } });
  if (Capacitor.isNativePlatform()) await App.addListener('appStateChange', ({ isActive }) => { if (!isActive) backgroundSave(); });
  report('saved', '已保存'); return state;
}

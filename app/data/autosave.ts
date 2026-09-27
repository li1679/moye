import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { openStorage, type Row } from './storage';

type Chapter = { id?: string; name: string; body: string; [key: string]: unknown };
type Book = { id: number; chapters: Chapter[]; [key: string]: unknown };
type LibraryState = { books: Book[]; [key: string]: unknown };
export const persistentFields = ['books', 'groups', 'view', 'prefs', 'toolbars', 'reading', 'readPrefs', 'editing', 'restorePoint'];
const fields = persistentFields.filter(field => field !== 'books');
const replacers = new WeakMap<object, (value: LibraryState) => Promise<void>>();
const savers = new WeakMap<object, () => Promise<void>>();
export function replaceLibrary(state: object, value: LibraryState) { return replacers.get(state)?.(value) ?? Promise.reject(new Error('本地存储尚未初始化')); }
export function saveNow(state: object) { return savers.get(state)?.() ?? Promise.reject(new Error('本地存储尚未初始化')); }

function snapshot(state: LibraryState): Row[] {
  const rows: Row[] = [{ id: 'schema', value: '1' }];
  for (const key of fields) if (state[key] !== undefined) rows.push({ id: key, value: JSON.stringify(state[key]) });
  rows.push({ id: 'book-order', value: JSON.stringify(state.books.map(book => book.id)) });
  for (const book of state.books) {
    for (const chapter of book.chapters) chapter.id ??= crypto.randomUUID();
    const { chapters, ...metadata } = book;
    rows.push({ id: 'book:' + book.id, value: JSON.stringify({ ...metadata, chapterIds: chapters.map(chapter => chapter.id) }) });
    for (const chapter of chapters) rows.push({ id: 'chapter:' + chapter.id, value: JSON.stringify(chapter) });
  }
  return rows;
}

export async function persistState<T extends LibraryState>(initial: T): Promise<T> {
  const badge = document.createElement('button');
  badge.className = 'save-status'; badge.setAttribute('aria-live', 'polite'); document.body.append(badge);
  const report = (message: string, failed = false) => { badge.hidden = !failed; badge.textContent = message; badge.dataset.failed = String(failed); };
  report('正在读取');
  const storage = await openStorage();
  let saved = await storage.read();
  if (saved.size) {
    if (saved.get('schema') !== '1') throw new Error('不支持的数据库版本，未覆盖原数据');
    const read = (id: string) => { const value = saved.get(id); if (value === undefined) throw new Error('数据库缺少记录：' + id); return JSON.parse(value); };
    initial.books = read('book-order').map((id: number) => { const { chapterIds, ...metadata } = read('book:' + id); return { ...metadata, chapters: chapterIds.map((chapterId: string) => read('chapter:' + chapterId)) }; });
    for (const field of fields) if (saved.has(field)) (initial as LibraryState)[field] = read(field);
  } else { const rows = snapshot(initial); await storage.commit(rows, []); saved = new Map(rows.map(row => [row.id, row.value])); }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | undefined;
  let dirty = false;
  let replacing = false;
  const dirtyFields = new Set<string>();
  const dirtyBooks = new Set<number>();
  const dirtyChapters = new Set<string>();
  let dirtyOrder = false;
  let dirtyAllBooks = false;

  const mark = (kind: 'field' | 'book' | 'chapter' | 'order', value?: string | number) => {
    if (replacing) throw new Error('正在恢复书库，请等待完成');
    dirty = true;
    if (kind === 'field') dirtyFields.add(String(value));
    else if (kind === 'book') dirtyBooks.add(Number(value));
    else if (kind === 'chapter') dirtyChapters.add(String(value));
    else { dirtyOrder = true; }
    report('待保存'); clearTimeout(timer); timer = setTimeout(backgroundSave, 350); deadline ??= setTimeout(backgroundSave, 2000);
  };

  const flush = (): Promise<void> => {
    clearTimeout(timer); clearTimeout(deadline); deadline = undefined;
    if (running) return running;
    if (!dirty) return Promise.resolve();
    running = (async () => {
      try {
        while (dirty) {
          dirty = false; report('正在保存');
          const next = new Map(saved); const upserts: Row[] = [];
          const fieldsToSave = new Set(dirtyFields);
          const bookIdsToSave = new Set(dirtyBooks);
          const booksToSave = dirtyAllBooks ? initial.books : initial.books.filter(book => bookIdsToSave.has(book.id));
          const chaptersToSave = new Set(dirtyChapters);
          const savingAllBooks = dirtyAllBooks;
          const savingOrder = dirtyOrder;
          for (const field of fieldsToSave) {
            if (initial[field] === undefined) next.delete(field);
            else { const row = { id: field, value: JSON.stringify(initial[field]) }; upserts.push(row); next.set(row.id, row.value); }
          }
          if (savingOrder || savingAllBooks) { const row = { id: 'book-order', value: JSON.stringify(initial.books.map(book => book.id)) }; upserts.push(row); next.set(row.id, row.value); }
          if (savingAllBooks) for (const id of [...next.keys()]) if (id.startsWith('book:') || id.startsWith('chapter:')) next.delete(id);
          for (const book of booksToSave) {
            for (const chapter of book.chapters) chapter.id ??= crypto.randomUUID();
            const old = saved.get('book:' + book.id);
            if (old) for (const id of JSON.parse(old).chapterIds as string[]) if (!book.chapters.some(chapter => chapter.id === id)) next.delete('chapter:' + id);
            const { chapters, ...metadata } = book;
            const bookRow = { id: 'book:' + book.id, value: JSON.stringify({ ...metadata, chapterIds: chapters.map(chapter => chapter.id) }) };
            upserts.push(bookRow); next.set(bookRow.id, bookRow.value);
            for (const chapter of chapters) {
              const row = { id: 'chapter:' + chapter.id, value: JSON.stringify(chapter) };
              upserts.push(row); next.set(row.id, row.value);
            }
          }
          if (!savingAllBooks) for (const chapterId of chaptersToSave) {
            const owner = initial.books.find(book => book.chapters.some(chapter => chapter.id === chapterId));
            const chapter = owner?.chapters.find(item => item.id === chapterId);
            if (chapter) { const row = { id: 'chapter:' + chapterId, value: JSON.stringify(chapter) }; upserts.push(row); next.set(row.id, row.value); }
            else next.delete('chapter:' + chapterId);
          }
          const deletes = [...saved.keys()].filter(id => !next.has(id));
          for (const field of fieldsToSave) dirtyFields.delete(field);
          for (const id of bookIdsToSave) dirtyBooks.delete(id);
          for (const chapterId of chaptersToSave) dirtyChapters.delete(chapterId);
          if (savingOrder) dirtyOrder = false;
          if (savingAllBooks) dirtyAllBooks = false;
          try { await storage.commit(upserts.filter(row => saved.get(row.id) !== row.value), deletes); }
          catch (error) {
            for (const field of fieldsToSave) dirtyFields.add(field);
            for (const id of bookIdsToSave) dirtyBooks.add(id);
            for (const chapterId of chaptersToSave) dirtyChapters.add(chapterId);
            dirtyOrder ||= savingOrder; dirtyAllBooks ||= savingAllBooks; dirty = true; throw error;
          }
          saved = next;
          if (dirtyFields.size || dirtyBooks.size || dirtyChapters.size || dirtyOrder || dirtyAllBooks) dirty = true;
        }
        report('已保存');
      } catch (error) { dirty = true; report('保存失败 · 点击重试', true); badge.title = String(error); console.error('保存失败', error); throw error; }
    })().finally(() => { running = undefined; });
    return running;
  };
  function backgroundSave() { void flush().catch(error => console.error('自动保存未完成，等待重试', error)); }

  const proxyTargets = new WeakMap<object, object>();
  const cache = new WeakMap<object, Map<string, object>>();
  const unwrap = (value: any) => proxyTargets.get(value) ?? value;
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
        const rawNext = unwrap(next);
        const previous = Reflect.get(target, property); const result = Reflect.set(target, property, rawNext);
        if (result && unwrap(previous) !== rawNext) {
          if (owner.kind === 'order') { mark('order'); dirtyAllBooks = true; }
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
          if (owner.kind === 'order') { mark('order'); dirtyAllBooks = true; }
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
      const rawValue = unwrap(value);
      const previous = Reflect.get(target, key);
      const result = Reflect.set(target, key, rawValue);
      if (result && unwrap(previous) !== rawValue) {
        if (key === 'books') { dirtyAllBooks = true; mark('order'); }
        else if (fields.includes(String(key))) mark('field', String(key));
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
      const rows = snapshot(value);
      const next = new Map(rows.map(row => [row.id, row.value]));
      await storage.commit(rows, [...saved.keys()].filter(id => !next.has(id)));
      for (const field of persistentFields) (initial as LibraryState)[field] = value[field];
      saved = next; dirty = false;
      dirtyFields.clear(); dirtyBooks.clear(); dirtyChapters.clear();
      dirtyOrder = false; dirtyAllBooks = false;
    } finally { replacing = false; }
    report('已保存');
  });
  badge.onclick = backgroundSave;
  document.addEventListener('visibilitychange', () => { if (document.hidden) backgroundSave(); });
  document.addEventListener('click', backgroundSave); window.addEventListener('pagehide', backgroundSave);
  window.addEventListener('beforeunload', event => { if (dirty || running || replacing) { event.preventDefault(); event.returnValue = ''; } });
  if (Capacitor.isNativePlatform()) await App.addListener('appStateChange', ({ isActive }) => { if (!isActive) backgroundSave(); });
  report('已保存'); return state;
}

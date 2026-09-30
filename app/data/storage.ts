import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import type { Row } from './schema';

export type { Row } from './schema';
export interface Storage {
  read(): Promise<Map<string, string>>;
  commit(upserts: Row[], deletes: string[]): Promise<void>;
}

export const READ_LIMITS = { maxChars: 1_000_000, maxIds: 500, largeRow: 400_000 };

/** 把行分成若干批：大行单独分片读，其余按总字符数和行数分批。纯函数，便于测试。 */
export function planReadBatches(index: { id: string; size: number }[], limits = READ_LIMITS) {
  const batches: string[][] = [];
  const large: { id: string; size: number }[] = [];
  let current: string[] = [];
  let chars = 0;
  for (const record of index) {
    if (record.size > limits.largeRow) { large.push(record); continue; }
    if (current.length && (chars + record.size > limits.maxChars || current.length >= limits.maxIds)) {
      batches.push(current); current = []; chars = 0;
    }
    current.push(record.id); chars += record.size;
  }
  if (current.length) batches.push(current);
  return { batches, large };
}

/** 按总字符数分批提交；所有 deletes 和 schema 行放在最后一批。只在数据迁移时使用。 */
export async function commitInBatches(storage: Storage, upserts: Row[], deletes: string[], maxChars = 1_000_000) {
  const schema = upserts.filter(row => row.id === 'schema');
  let batch: Row[] = [];
  let chars = 0;
  for (const row of upserts) {
    if (row.id === 'schema') continue;
    if (batch.length && chars + row.value.length > maxChars) { await storage.commit(batch, []); batch = []; chars = 0; }
    batch.push(row); chars += row.value.length;
  }
  await storage.commit([...batch, ...schema], deletes);
}

// openStorage() 只打开一次：同一个页面里再调用（例如错误页的"导出原始数据"），拿到的是同一个 Storage。
let opening: Promise<Storage> | undefined;
export function openStorage(): Promise<Storage> {
  opening ??= open().catch(error => { opening = undefined; throw error; });
  return opening;
}

async function open(): Promise<Storage> {
  if (Capacitor.isNativePlatform()) {
    const connection = new SQLiteConnection(CapacitorSQLite);
    // location.reload()（恢复备份之后、错误页的"重新读取"）不会关闭原生端的连接，
    // 直接 createConnection 会报"连接已存在"，所以先对齐两边的连接表，已有连接就直接取用。
    await connection.checkConnectionsConsistency().catch(() => undefined);
    const db = (await connection.isConnection('local_editing', false)).result
      ? await connection.retrieveConnection('local_editing', false)
      : await connection.createConnection('local_editing', false, 'no-encryption', 1, false);
    if (!(await db.isDBOpen()).result) await db.open();
    await db.execute('CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL); PRAGMA user_version=1;');
    return {
      async read() {
        const index = (await db.query('SELECT id, length(value) AS size FROM records')).values as { id: string; size: number }[];
        const { batches, large } = planReadBatches(index);
        const rows = new Map<string, string>();
        for (const ids of batches) {
          const result = await db.query(`SELECT id, value FROM records WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
          const values = (result.values ?? []) as Row[];
          if (values.length !== ids.length) throw new Error('无法读取本地记录');
          for (const row of values) rows.set(row.id, row.value);
        }
        for (const record of large) {
          // 大行按 131072 个字符分片读取，绑定单次 CursorWindow 的读取上限。
          const parts: string[] = [];
          for (let offset = 1; offset <= record.size; offset += 131072) {
            const result = await db.query('SELECT substr(value, ?, ?) AS part FROM records WHERE id=?', [offset, 131072, record.id]);
            const part = result.values?.[0]?.part;
            if (typeof part !== 'string') throw new Error('无法读取本地记录：' + record.id);
            parts.push(part);
          }
          rows.set(record.id, parts.join(''));
        }
        return rows;
      },
      async commit(upserts, deletes) {
        const statements = [
          ...upserts.map(row => ({ statement: 'INSERT INTO records(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value', values: [row.id, row.value] })),
          ...deletes.map(id => ({ statement: 'DELETE FROM records WHERE id=?', values: [id] })),
        ];
        if (statements.length) await db.executeSet(statements, true);
      },
    };
  }
  // Browser preview has a separate local database, never a fallback for native failures.
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('local-editing-preview', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('records', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('数据库升级被其他页面阻挡，请关闭其他预览页'));
  });
  return {
    read: () => new Promise<Map<string, string>>((resolve, reject) => {
      const tx = db.transaction('records', 'readonly');
      const request = tx.objectStore('records').getAll();
      tx.oncomplete = () => resolve(new Map((request.result as Row[]).map(row => [row.id, row.value])));
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    }),
    commit: (upserts, deletes) => new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readwrite');
      const store = tx.objectStore('records');
      for (const row of upserts) store.put(row);
      for (const id of deletes) store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    }),
  };
}

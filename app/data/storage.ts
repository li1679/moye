import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

export type Row = { id: string; value: string };
export interface Storage {
  read(): Promise<Row[]>;
  commit(upserts: Row[], deletes: string[]): Promise<void>;
}

export async function openStorage(): Promise<Storage> {
  if (Capacitor.isNativePlatform()) {
    const connection = new SQLiteConnection(CapacitorSQLite);
    const db = await connection.createConnection('local_editing', false, 'no-encryption', 1, false);
    await db.open();
    await db.execute('CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL); PRAGMA user_version=1;');
    return {
      async read() {
        // Keep every chapter in one record; bound individual CursorWindow reads.
        const index = (await db.query('SELECT id, length(value) AS size FROM records')).values as { id: string; size: number }[];
        const rows: Row[] = [];
        for (const record of index) {
          const parts: string[] = [];
          for (let offset = 1; offset <= record.size; offset += 131072) {
            const result = await db.query('SELECT substr(value, ?, ?) AS part FROM records WHERE id=?', [offset, 131072, record.id]);
            const part = result.values?.[0]?.part;
            if (typeof part !== 'string') throw new Error('无法读取本地记录：' + record.id);
            parts.push(part);
          }
          rows.push({ id: record.id, value: parts.join('') });
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
    read: () => new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readonly');
      const request = tx.objectStore('records').getAll();
      tx.oncomplete = () => resolve(request.result);
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

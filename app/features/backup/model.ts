import { validateLibrary, BACKUP_FIELDS, clone, type Library } from '../../data/schema';
// 数据结构（类型、校验、快照、备份字段表）唯一定义在 app/data/schema.ts，这里只保留备份文件格式的编解码。
export { clone, validateLibrary, snapshotLibrary, type Library } from '../../data/schema';

function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function requireValue(condition: unknown, message: string): asserts condition { if (!condition) throw new Error('备份无效：' + message); }
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
  const data = Object.fromEntries(BACKUP_FIELDS.map(key => [key, clone((state as Record<string, unknown>)[key] ?? (key === 'books' || key === 'groups' ? [] : {}))])) as Library;
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

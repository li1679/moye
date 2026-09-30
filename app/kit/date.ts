/** 本地时区的 YYYY-MM-DD，用于备份与原始数据导出文件名。 */
export function localDate(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

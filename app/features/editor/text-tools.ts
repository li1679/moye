export type FormatOptions = { indent: boolean; spaces: boolean; punctuation?: boolean; paragraph: string | number };

export function formatText(body: string, options: FormatOptions): string {
  const newline = body.match(/\r\n|\n|\r/)?.[0] || '\n';
  let lines = body.split(/\r\n|\n|\r/);
  let start = 0, end = lines.length;
  while (start < end && !lines[start].trim()) start++;
  while (end > start && !lines[end - 1].trim()) end--;
  lines = lines.slice(start, end);
  lines = lines.map(line => {
    if (!line.trim()) return '';
    if (options.spaces) line = line.replace(/^[\t \u3000]+|[\t \u3000]+$/g, '');
    if (options.indent) line = '\u3000\u3000' + line.replace(/^[\t \u3000]+/, '');
    // Kept for settings compatibility; English periods are never rewritten.
    return line;
  });
  if (options.paragraph !== '不限') {
    const gap = Number(options.paragraph);
    if (!Number.isInteger(gap) || gap < 0 || gap > 3) throw new Error('段落间隔必须为 0–3 行');
    return lines.filter(line => line !== '').join(newline.repeat(gap + 1));
  }
  return lines.join(newline);
}

export function countCharacters(text: string): number {
  let count = 0;
  for (const _character of text) count++;
  return count;
}

export type SearchDocument = { bookId: number; chapterId: string; title: string; bookName: string; body: string };
export type SearchHit = { bookId: number; chapterId: string; title: string; bookName: string; offset: number; before: string; match: string; after: string };
export function searchText(documents: SearchDocument[], query: string, page = 0) {
  const hits: SearchHit[] = [];
  let total = 0;
  if (!query) return { hits, total };
  for (const document of documents) {
    let offset = 0;
    while ((offset = document.body.indexOf(query, offset)) !== -1) {
      if (total >= page * 50 && hits.length < 50) {
        hits.push({
          bookId: document.bookId, chapterId: document.chapterId, title: document.title, bookName: document.bookName, offset,
          before: document.body.slice(Math.max(0, offset - 24), offset), match: query, after: document.body.slice(offset + query.length, offset + query.length + 45),
        });
      }
      total++;
      offset += query.length;
    }
  }
  return { hits, total };
}

export function replaceText(body: string, query: string, replacement: string, offset?: number): string {
  if (!query) throw new Error('请输入查找文本');
  if (offset !== undefined) {
    if (body.slice(offset, offset + query.length) !== query) throw new Error('匹配内容已变化，请重新查找');
    return body.slice(0, offset) + replacement + body.slice(offset + query.length);
  }
  return body.split(query).join(replacement);
}

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

// 字数：除空白以外的字符数（按 Unicode 码点）。空白是指 JS 正则 \s 能匹配的全部字符，包括全角空格和换行。
export function countWords(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) { count++; i++; continue; }
    }
    if (isSpace(code)) continue;
    count++;
  }
  return count;
}
function isSpace(code: number) {
  return code === 0x20 || (code >= 0x09 && code <= 0x0d) || code === 0xa0 || code === 0x1680 || (code >= 0x2000 && code <= 0x200a)
    || code === 0x2028 || code === 0x2029 || code === 0x202f || code === 0x205f || code === 0x3000 || code === 0xfeff;
}

// 按正文字符串缓存：正文没变时，直接返回上次的结果（同一个字符串对象，比较很快）。
const wordCache = new WeakMap<object, { body: string; words: number }>();
export function wordsOf(chapter: { body: string }): number {
  const hit = wordCache.get(chapter);
  if (hit && hit.body === chapter.body) return hit.words;
  const words = countWords(chapter.body);
  wordCache.set(chapter, { body: chapter.body, words });
  return words;
}
export const bookWords = (book: { chapters: { body: string }[] }) => book.chapters.reduce((sum, chapter) => sum + wordsOf(chapter), 0);

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

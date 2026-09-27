export type Encoding = 'auto' | 'utf-8' | 'gb18030' | 'utf-16le' | 'utf-16be' | 'big5';
export type ChapterText = {
  name: string;
  body: string;
  sourceHeading?: { name: string; raw: string } | null;
};
export type ParsedText = { name: string; author: string; chapters: ChapterText[]; encoding: string; hash: string; characters: number };

export function decodeText(bytes: Uint8Array, requested: Encoding): { text: string; encoding: string } {
  let encoding: string = requested;
  if (requested === 'auto') {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le';
    else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be';
    else {
      try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' }; }
      catch { encoding = 'gb18030'; } // Explicit encoding detection, not a failed import disguised as success.
    }
  }
  try {
    return { text: new TextDecoder(encoding, { fatal: true }).decode(bytes), encoding };
  } catch {
    throw new Error('无法按 ' + encoding + ' 解码，请切换编码后重新预览。');
  }
}

function isHeading(line: string): boolean {
  // Normalize only for recognition; retain the original title and source bytes.
  const title = line.trim().normalize('NFKC');
  if (!title || title.length > 100) return false;
  return /^(?:第\s*[〇零一二三四五六七八九十百千万两\d]+\s*[章回节篇](?:\s.*|[：:、.．·—-].*|[^\s]{0,35})|(?:序章|序言|前言|楔子|尾声|后记|终章|番外)(?:\s.*|[：:、.．·—-].*|[一二三四五六七八九十\d]+.*)?|chapter\s+\d+(?:\s.*|[.:：-].*)?)$/i.test(title);
}

export function parseText(text: string, filename: string, mode: 'auto' | 'single'): Omit<ParsedText, 'encoding' | 'hash'> {
  if (!text.length) throw new Error('这个 TXT 是空文件，请选择有正文的文件。');
  const beginning = text.slice(0, 4096);
  const title = beginning.match(/^(?:书名\s*[：:]\s*(.+)|《([^\r\n]{1,100})》(?:\s*作者.*)?)\s*$/m);
  const author = beginning.match(/(?:^|\s)作者\s*[：:]\s*([^\r\n]+)/m);
  const name = (title?.[1] || title?.[2] || filename.replace(/\.txt$/i, '')).trim();
  const chapters: ChapterText[] = [];
  if (mode === 'single') return { name, author: author?.[1]?.trim() || '', chapters: [{ name: '正文', body: text, sourceHeading: null }], characters: text.length };
  let bodyStart = 0;
  let current: { name: string; raw: string } | null = null;
  const lines = /([^\r\n]*)(\r\n|\n|\r|$)/g;
  for (const match of text.matchAll(lines)) {
    if (!match[0]) continue;
    if (!isHeading(match[1])) continue;
    const start = match.index!;
    if (current) chapters.push({ name: current.name, body: text.slice(bodyStart, start), sourceHeading: current });
    else if (start > 0) chapters.push({ name: '前文', body: text.slice(0, start), sourceHeading: null });
    current = { name: match[1].trim(), raw: match[0] };
    bodyStart = start + match[0].length;
  }
  if (current) chapters.push({ name: current.name, body: text.slice(bodyStart), sourceHeading: current });
  else chapters.push({ name: '正文', body: text, sourceHeading: null });
  // Titles and bodies must together preserve every decoded character.
  if (chapters.map(chapter => (chapter.sourceHeading?.raw || '') + chapter.body).join('') !== text) {
    throw new Error('章节解析完整性检查失败，未导入。');
  }
  return { name, author: author?.[1]?.trim() || '', chapters, characters: text.length };
}

export function exportText(book: { name: string; author?: string; chapters: ChapterText[] }, options: { titles: boolean; metadata: boolean; spacing: 'original' | '0' | '1' | '2' }): string {
  const sections = book.chapters.map(chapter => {
    let heading = '';
    if (options.titles && (chapter.sourceHeading !== null || !['前文', '正文'].includes(chapter.name))) {
      heading = chapter.sourceHeading?.name === chapter.name ? chapter.sourceHeading.raw : chapter.name + '\n';
      if (chapter.body && !/[\r\n]$/.test(heading)) heading += '\n';
    }
    return heading + chapter.body;
  });
  let text = '';
  sections.forEach((section, index) => {
    if (index) {
      if (options.spacing !== 'original') text += '\n'.repeat(Number(options.spacing) + 1);
      else if (text && !/[\r\n]$/.test(text)) text += '\n\n';
    }
    text += section;
  });
  if (options.metadata) text = '书名：' + book.name + '\n' + (book.author ? '作者：' + book.author + '\n' : '') + '\n' + text;
  return text;
}

export function txtFilename(input: string): string {
  const stem = input.trim().replace(/(?:\.txt)+$/i, '').trim();
  if (!stem || /[<>:"/\\|?*\x00-\x1f]/.test(stem) || /[. ]$/.test(stem)) throw new Error('请输入有效文件名，不要包含路径或特殊符号。');
  if (stem.length > 100) throw new Error('文件名称请控制在 100 个字符以内。');
  return stem + '.txt';
}

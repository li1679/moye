export type Encoding = 'auto' | 'utf-8' | 'gb18030' | 'utf-16le' | 'utf-16be' | 'big5';
export type ChapterText = {
  name: string;
  body: string;
  sourceHeading?: { name: string; raw: string } | null;
};
export type ParsedText = { name: string; author: string; chapters: ChapterText[]; encoding: string; hash: string; characters: number; warning?: string };

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

type Heading = { start: number; end: number; name: string; raw: string; kind: 'chapter' | 'volume' | 'special'; numbered: boolean };
const STOP_WORDS = new Set('回合 回来 回去 回到 回家 回头 回答 回复 回忆 回应 回事 节课 节目 节日 节奏 节约 节省 节点 章程 篇幅 篇章 卷子 卷入 卷起 部分 部门 部队 部长 部署 集合 集团 集体 集中 集市'.split(' '));
const NUMBERED = /^(?:正文\s*)?[【\[〔(]?\s*第\s*([〇零一二三四五六七八九十百千万两\d]+)\s*([章回节篇卷部集])(.*)$/;
const SPECIAL = /^(?:序章|序言|前言|楔子|尾声|后记|终章|番外)(?:\s.*|[：:、.．·—-].*|[一二三四五六七八九十\d]+.*)?$|^chapter\s+\d+(?:\s.*|[.:：-].*)?$/i;

function structuralHeading(line: string): { kind: Heading['kind']; numbered: boolean } | null {
  const title = line.trim().normalize('NFKC');
  if (!title || title.length > 50) return null;
  const match = title.match(NUMBERED);
  if (match) {
    const unit = match[2];
    const rest = match[3].replace(/^\s*[】\]〕)]/, '');
    if (rest) {
      const separated = /^[\s：:、.．·—-]/.test(rest);
      if (separated) {
        if (rest.replace(/^[\s：:、.．·—-]+/, '').length > 30) return null;
      } else if (rest.length > 12 || /[，,。！？!?；;]/.test(rest) || STOP_WORDS.has(unit + rest[0])) return null;
    }
    return { kind: ['卷', '部', '集'].includes(unit) ? 'volume' : 'chapter', numbered: true };
  }
  return SPECIAL.test(title) ? { kind: 'special', numbered: false } : null;
}

function scanLines(text: string) {
  const result: { line: string; raw: string; start: number; end: number }[] = [];
  const lines = /([^\r\n]*)(\r\n|\n|\r|$)/g;
  for (const match of text.matchAll(lines)) if (match[0]) result.push({ line: match[1], raw: match[0], start: match.index!, end: match.index! + match[0].length });
  return result;
}

function headingsOf(text: string): Heading[] {
  const lines = scanLines(text);
  const structural = lines.flatMap(line => {
    const found = structuralHeading(line.line);
    return found ? [{ ...line, name: line.line.trim(), ...found }] : [];
  });
  if (structural.some(heading => heading.numbered)) return structural;
  const numeric = lines.flatMap(line => {
    const title = line.line.trim().normalize('NFKC');
    if (!title || title.length > 50 || /[。！？!?]$/.test(title)) return [];
    const match = title.match(/^(\d{1,4})(?:[.、．]\s*|\s+)?(\S.{0,24})?$/);
    return match ? [{ ...line, name: line.line.trim(), kind: 'chapter' as const, numbered: false, number: Number(match[1]) }] : [];
  });
  const sequential = numeric.slice(1).filter((heading, index) => heading.number === numeric[index].number + 1).length;
  const accepted = numeric.length >= 5 && sequential / Math.max(1, numeric.length - 1) >= .8 ? numeric : [];
  return [...structural, ...accepted].sort((a, b) => a.start - b.start);
}

export function parseText(text: string, filename: string, mode: 'auto' | 'single'): Omit<ParsedText, 'encoding' | 'hash'> {
  if (!text.length) throw new Error('这个 TXT 是空文件，请选择有正文的文件。');
  const beginning = text.slice(0, 4096);
  const title = beginning.match(/^(?:书名\s*[：:]\s*(.+)|《([^\r\n]{1,100})》(?:\s*作者.*)?)\s*$/m);
  const author = beginning.match(/(?:^|\s)作者\s*[：:]\s*([^\r\n]+)/m);
  const name = (title?.[1] || title?.[2] || filename.replace(/\.txt$/i, '')).trim();
  const chapters: ChapterText[] = [];
  if (mode === 'single') return { name, author: author?.[1]?.trim() || '', chapters: [{ name: '正文', body: text, sourceHeading: null }], characters: text.length };
  const found = headingsOf(text);
  const headings: Heading[] = [];
  for (let index = 0; index < found.length; index++) {
    const heading = found[index], next = found[index + 1];
    if (heading.kind === 'volume' && next?.kind === 'chapter' && /^\s*$/.test(text.slice(heading.end, next.start))) {
      headings.push({ ...next, start: heading.start, name: `${heading.name} ${next.name}`, raw: text.slice(heading.start, next.end) });
      index++;
    } else headings.push(heading);
  }
  let bodyStart = 0;
  let current: Heading | null = null;
  for (const heading of headings) {
    if (current) chapters.push({ name: current.name, body: text.slice(bodyStart, heading.start), sourceHeading: { name: current.name, raw: current.raw } });
    else if (heading.start > 0) chapters.push({ name: '前文', body: text.slice(0, heading.start), sourceHeading: null });
    current = heading;
    bodyStart = heading.end;
  }
  if (current) chapters.push({ name: current.name, body: text.slice(bodyStart), sourceHeading: { name: current.name, raw: current.raw } });
  else chapters.push({ name: '正文', body: text, sourceHeading: null });
  if (chapters.map(chapter => (chapter.sourceHeading?.raw || '') + chapter.body).join('') !== text) throw new Error('章节解析完整性检查失败，未导入。');
  const short = chapters.filter(chapter => chapter.body.trim().length < 50).length;
  const warning = chapters.length >= 10 && short / chapters.length > .3
    ? `识别出较多很短的章节（${short} 章不足 50 字），可能把正文当成了标题。可以改选“整篇作为一章”。`
    : undefined;
  return { name, author: author?.[1]?.trim() || '', chapters, characters: text.length, ...(warning ? { warning } : {}) };
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

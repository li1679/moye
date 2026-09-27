import { saveNow } from '../../data/autosave';
import { nextLibraryOrder } from '../../data/schema';
import { saveTextFile } from './files';
import { exportText, txtFilename, type ParsedText, type ChapterText } from './text';

type Book = { id: number; name: string; author: string; chapters: ChapterText[]; sourceHash?: string; group: number | null; libraryOrder?: number };
type Context = {
  state: { books: Book[]; groups: { id: number; name: string; libraryOrder?: number }[]; book: number; chapter: number; page: string; tab: string; folder: number | null; readerControls: boolean };
  openSheet: (title: string, body: string) => void;
  closeSheet: () => void;
  render: () => void;
  toast: (text: string) => void;
};

export function createTxtFlows(context: Context) {
  const { state, openSheet, closeSheet, render, toast } = context;
  const sheet = document.querySelector<HTMLDialogElement>('#sheet')!;
  let worker: Worker | undefined;
  let revision = 0;
  let busy = false;
  sheet.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  sheet.addEventListener('close', () => { worker?.terminate(); revision++; });
  sheet.addEventListener('click', event => {
    if (busy && !(event.target as HTMLElement).closest('form')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  function openImport() {
    openSheet('导入 TXT', `<form id="txt-import-form">
      <label class="form-field"><span>选择 TXT 文件</span><input id="txt-file" type="file" accept=".txt,text/plain" required></label>
      <label class="form-field"><span>文本编码</span><select id="txt-encoding"><option value="auto">自动识别</option><option value="utf-8">UTF-8</option><option value="gb18030">GB18030 / GBK</option><option value="utf-16le">UTF-16 LE</option><option value="utf-16be">UTF-16 BE</option><option value="big5">Big5</option></select></label>
      <label class="form-field"><span>章节识别</span><select id="txt-mode"><option value="auto">自动识别章节</option><option value="single">整篇作为一章</option></select></label>
      <p id="txt-summary" class="hint" role="status">选择文件后预览识别结果。</p>
      <div id="txt-result" hidden>
        <label class="form-field"><span>书名</span><input id="txt-title" maxlength="100" required></label>
        <label class="form-field"><span>作者</span><input id="txt-author" maxlength="100" placeholder="未识别到可留空"></label>
        <label class="form-field"><span>章节预览</span><select id="txt-chapter"></select></label>
        <pre id="txt-preview" class="txt-preview"></pre>
        <label id="txt-duplicate-row" class="row" hidden><span>已导入过此文件，仍作为另一本书导入</span><input id="txt-duplicate" type="checkbox"></label>
        <label class="form-field"><span>导入后</span><select id="txt-destination"><option value="chapters">查看目录</option><option value="reader">开始阅读</option></select></label>
      </div>
      <p id="txt-error" class="error" role="alert"></p>
      <button class="primary" id="txt-confirm" disabled>确认导入</button>
    </form>`);
    const form = sheet.querySelector<HTMLFormElement>('#txt-import-form')!;
    const find = <T extends HTMLElement>(selector: string) => form.querySelector<T>(selector)!;
    const confirm = find<HTMLButtonElement>('#txt-confirm');
    const error = find('#txt-error');
    let parsed: ParsedText | undefined;
    let file: File | undefined;
    const preview = () => {
      const chapter = parsed?.chapters[Number(find<HTMLSelectElement>('#txt-chapter').value)];
      find('#txt-preview').textContent = chapter ? chapter.body.slice(0, 2000) + (chapter.body.length > 2000 ? '\n…（仅预览前 2000 字，导入保留全部正文）' : '') : '';
    };
    const parse = async () => {
      const selected = find<HTMLInputElement>('#txt-file').files?.[0];
      if (!selected) return;
      file = selected;
      const current = ++revision;
      worker?.terminate();
      parsed = undefined;
      confirm.disabled = true;
      find('#txt-result').hidden = true;
      error.textContent = '';
      find('#txt-summary').textContent = '正在读取并识别…';
      try {
        if (!/\.txt$/i.test(selected.name)) throw new Error('请选择 .txt 格式的文件。');
        const bytes = await selected.arrayBuffer();
        if (current !== revision) return;
        worker = new Worker(new URL('./txt.worker.ts', import.meta.url), { type: 'module' });
        const failure = (message: string) => {
          if (current !== revision) return;
          error.textContent = message;
          find('#txt-summary').textContent = '识别未完成，请调整后重试。';
          worker?.terminate();
        };
        worker.onerror = event => failure(event.message || '识别程序无法启动，请重试。');
        worker.onmessage = event => {
          if (current !== revision) return;
          if (event.data.error) { failure(event.data.error); return; }
          parsed = event.data.result as ParsedText;
          find<HTMLInputElement>('#txt-title').value = parsed.name;
          find<HTMLInputElement>('#txt-author').value = parsed.author;
          const select = find<HTMLSelectElement>('#txt-chapter');
          select.replaceChildren();
          parsed.chapters.forEach((chapter, index) => select.add(new Option(chapter.name, String(index))));
          const duplicate = state.books.some(book => book.sourceHash === parsed!.hash);
          find('#txt-duplicate-row').hidden = !duplicate;
          find<HTMLInputElement>('#txt-duplicate').checked = false;
          find('#txt-summary').textContent = selected.name + ' · ' + parsed.encoding.toUpperCase() + ' · ' + parsed.chapters.length + ' 章 · ' + parsed.characters.toLocaleString() + ' 字符（含标题和空白）';
          find('#txt-result').hidden = false;
          confirm.disabled = false;
          preview();
          worker?.terminate();
        };
        worker.postMessage({ bytes, filename: selected.name, encoding: find<HTMLSelectElement>('#txt-encoding').value, mode: find<HTMLSelectElement>('#txt-mode').value }, [bytes]);
      } catch (failure) {
        if (current !== revision) return;
        error.textContent = String(failure instanceof Error ? failure.message : failure);
        find('#txt-summary').textContent = '文件读取失败。';
      }
    };
    for (const selector of ['#txt-file', '#txt-encoding', '#txt-mode']) find(selector).addEventListener('change', parse);
    find('#txt-chapter').addEventListener('change', preview);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      event.stopPropagation();
      if (!parsed || !file || busy) return;
      const name = find<HTMLInputElement>('#txt-title').value.trim();
      if (!name) { error.textContent = '书名不能为空。'; return; }
      if (state.books.some(book => book.sourceHash === parsed!.hash) && !find<HTMLInputElement>('#txt-duplicate').checked) {
        error.textContent = '此文件已经导入。若要再建一本，请勾选重复导入。';
        return;
      }
      busy = true;
      for (const control of Array.from(form.elements)) (control as HTMLInputElement).disabled = true;
      error.textContent = '';
      confirm.textContent = '正在保存…';
      let id = Date.now();
      while (state.books.some(book => book.id === id)) id++;
      const imported: Book = {
        id, name, author: find<HTMLInputElement>('#txt-author').value.trim(), group: null,
        libraryOrder: nextLibraryOrder(context.state, null),
        chapters: parsed.chapters, sourceHash: parsed.hash,
      };
      state.books.push(imported);
      try {
        await saveNow(state);
        const destination = find<HTMLSelectElement>('#txt-destination').value;
        busy = false;
        closeSheet();
        state.book = id;
        state.chapter = 0;
        state.folder = null;
        state.tab = destination === 'reader' ? 'read' : 'edit';
        state.page = destination;
        state.readerControls = false;
        render();
        toast('已导入并保存');
      } catch (failure) {
        state.books = state.books.filter(book => book.id !== id);
        error.textContent = '导入未保存，请重试：' + String(failure instanceof Error ? failure.message : failure);
        busy = false;
        for (const control of Array.from(form.elements)) (control as HTMLInputElement).disabled = false;
        confirm.textContent = '重新导入';
      }
    });
  }

  function openExport(book: Book, chapter?: ChapterText) {
    openSheet('导出 TXT', `<form id="txt-export-form">
      <label class="form-field"><span>文件名称</span><input id="export-name" required maxlength="104"></label>
      <label class="row"><span>包含章节标题</span><input id="export-titles" type="checkbox" ${chapter ? '' : 'checked'}></label>
      <label class="row"><span>包含书名和作者</span><input id="export-metadata" type="checkbox"></label>
      <label class="form-field"><span>章节之间额外空行</span><select id="export-spacing"><option value="original">保持原文</option><option value="0">额外换行</option><option value="1">额外一空行</option><option value="2">额外两空行</option></select></label>
      <p class="hint">UTF-8 · 生成新文件。正文中的缩进和空行会保留。</p>
      <p id="export-error" class="error" role="alert"></p>
      <button class="primary">导出</button>
    </form>`);
    const form = sheet.querySelector<HTMLFormElement>('#txt-export-form')!;
    const find = <T extends HTMLElement>(selector: string) => form.querySelector<T>(selector)!;
    find<HTMLInputElement>('#export-name').value = chapter?.name || book.name;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      event.stopPropagation();
      if (busy) return;
      const button = form.querySelector<HTMLButtonElement>('.primary')!;
      try {
        const filename = txtFilename(find<HTMLInputElement>('#export-name').value);
        busy = true;
        button.disabled = true;
        find('#export-error').textContent = '';
        await saveNow(state);
        const text = exportText({ ...book, chapters: chapter ? [chapter] : book.chapters }, {
          titles: find<HTMLInputElement>('#export-titles').checked,
          metadata: find<HTMLInputElement>('#export-metadata').checked,
          spacing: find<HTMLSelectElement>('#export-spacing').value as 'original' | '0' | '1' | '2',
        });
        const result = await saveTextFile(filename, text);
        busy = false;
        if (result === 'cancelled') return;
        closeSheet();
        toast(result === 'saved' ? '已导出 TXT' : '已发起 TXT 下载');
      } catch (failure) {
        find('#export-error').textContent = '导出未完成：' + String(failure instanceof Error ? failure.message : failure);
      } finally { busy = false; button.disabled = false; }
    });
  }
  return { openImport, openExport };
}

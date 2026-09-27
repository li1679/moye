import { saveNow, replaceLibrary } from '../../data/autosave';
import { saveDocument } from '../txt/files';
import { canRestore, restoreEntry, librarySnapshot, encodeBackup, decodeBackup, clone, recoveryCapacityLabel, type Library } from './model';
type Context = { state: Library; openSheet: (title: string, html: string) => void; prepare: () => void };
const esc = (value: string) => value.replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]!);
export function createRecoveryFlows({ state, openSheet, prepare }: Context) {
  const sheet = document.querySelector<HTMLDialogElement>('#sheet')!;
  let busy = false;
  sheet.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  sheet.addEventListener('click', event => {
    if (busy) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  const error = (failure: unknown) => {
    const element = sheet.querySelector('#recovery-error');
    if (element) element.textContent = failure instanceof Error ? failure.message : String(failure);
    console.error('恢复操作未完成', failure);
  };
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    busy = true;
    document.querySelector<HTMLElement>('#app')!.inert = true;
    try { await work(); }
    catch (failure) { error(failure); }
    finally { busy = false; document.querySelector<HTMLElement>('#app')!.inert = false; }
  };
  async function apply(next: Library) {
    prepare();
    await replaceLibrary(state, next);
    location.reload();
  }
  function recovery() {
    openSheet('误操作恢复', `<p class="hint">保留删除与改文前的整本书版本。恢复记录：${recoveryCapacityLabel(state.recovery)}，不自动清除；达到上限会阻止新的危险操作。后续已有修改时，可恢复为副本。</p><div id="recovery-list"></div><p class="error" id="recovery-error" role="alert"></p>`);
    const list = sheet.querySelector('#recovery-list')!;
    if (!state.recovery.length) list.textContent = '暂无恢复记录';
    [...state.recovery].reverse().forEach(entry => {
      const row = document.createElement('button');
      row.className = 'row';
      row.textContent = entry.label + ' · ' + new Date(entry.date).toLocaleString();
      row.dataset.recoveryId = entry.id;
      row.onclick = () => detail(entry.id);
      list.append(row);
      const remove = document.createElement('button');
      remove.className = 'text-action';
      remove.textContent = '删除此记录';
      remove.setAttribute('aria-label', '删除记录：' + entry.label);
      remove.onclick = () => {
        detail(entry.id);
        (sheet.querySelector('#remove-record') as HTMLButtonElement).click();
      };
      list.append(remove);
    });
  }
  function detail(id: string) {
    const entry = state.recovery.find(record => record.id === id)!;
    const allowed = canRestore(state, entry);
    openSheet('恢复记录', `<p>${esc(entry.label)}</p><p class="hint">${entry.before.map(book => esc(book.name) + ' · ' + book.chapters.length + ' 章').join('<br>')}</p><p class="hint">${allowed ? '恢复原位置会撤回这次操作；恢复记录仍保留。' : '原书已有其他修改或被删除，直接恢复已禁用。可生成独立副本保留旧内容。'}</p><button class="primary" id="restore-original" ${allowed ? '' : 'disabled'}>恢复原位置</button><button class="row" id="restore-copy">恢复为副本</button><button class="row" id="remove-record">永久删除此恢复记录</button><p class="error" id="recovery-error" role="alert"></p>`);
    sheet.querySelector('#restore-original')!.addEventListener('click', () => void run(async () => {
      await saveNow(state);
      await apply(restoreEntry(state, entry, false));
    }));
    (sheet.querySelector('#restore-copy') as HTMLButtonElement).disabled = entry.before.length === 0;
    sheet.querySelector('#restore-copy')!.addEventListener('click', () => void run(async () => {
      await saveNow(state);
      await apply(restoreEntry(state, entry, true));
    }));
    sheet.querySelector('#remove-record')!.addEventListener('click', () => {
      openSheet('永久删除恢复记录', '<p class="hint">此操作无法撤销。书库中的现有书籍不受影响；此记录中仅存于历史版本的内容将不再可恢复。</p><button class="primary" id="confirm-remove-record">确认永久删除</button><p class="error" id="recovery-error" role="alert"></p>');
      sheet.querySelector('#confirm-remove-record')!.addEventListener('click', () => void run(async () => {
        const next = librarySnapshot(state);
        next.recovery = next.recovery.filter(record => record.id !== id);
        await apply(next);
      }));
    });
  }
  function backup() {
    openSheet('完整备份与恢复', `<p class="hint">备份包括书籍正文、内嵌封面、分组排序、设置、阅读/编辑位置及恢复记录。文件为本地 JSON，未加密，请自行保管。</p><label class="form-field"><span>备份文件名</span><input id="backup-name" value="墨页备份-${new Date().toISOString().slice(0,10)}.json"></label><button class="primary" id="export-backup">导出完整备份</button><label class="form-field"><span>选择备份以恢复</span><input id="backup-file" type="file" accept=".json,application/json"></label><div id="backup-preview"></div>${state.restorePoint ? '<button class="row" id="restore-previous">恢复到上次导入备份前</button>' : ''}<p id="recovery-error" class="error" role="alert"></p><p id="backup-status" class="hint" role="status"></p>`);
    sheet.querySelector('#export-backup')!.addEventListener('click', () => void run(async () => {
      prepare();
      await saveNow(state);
      const stem = sheet.querySelector<HTMLInputElement>('#backup-name')!.value.trim().replace(/(?:\.json)+$/i, '');
      if (!stem || stem.length > 100) throw new Error('备份文件名须为 1–100 个字符');
      const name = stem + '.json';
      const status = sheet.querySelector('#backup-status')!;
      status.textContent = '正在生成备份…';
      const result = await saveDocument(name, await encodeBackup(state), 'application/json');
      status.textContent = result === 'saved' ? '完整备份已保存' : result === 'download' ? '已发起备份下载' : '已取消保存';
    }));
    let generation = 0;
    sheet.querySelector('#backup-file')!.addEventListener('change', async event => {
      const current = ++generation;
      const preview = sheet.querySelector('#backup-preview')!;
      preview.replaceChildren();
      sheet.querySelector('#recovery-error')!.textContent = '';
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        if (file.size > 256 * 1024 * 1024) throw new Error('备份超过当前 256MiB 恢复上限，未修改本地数据。');
        const result = await decodeBackup(await file.text());
        if (current !== generation || !preview.isConnected) return;
        const text = document.createElement('p');
        text.className = 'hint';
        text.textContent = `备份时间：${result.created}。包含 ${result.data.books.length} 本书、${result.data.groups.length} 个分组、${result.data.recovery.length} 条恢复记录。将完整替换现有书库及设置，不合并；当前书库会保留为一个恢复点（下一次恢复时替换）。`;
        const check = document.createElement('label');
        check.className = 'row';
        check.innerHTML = '<span>我已确认覆盖当前书库</span><input id="backup-confirm-check" type="checkbox">';
        const confirm = document.createElement('button');
        confirm.className = 'primary';
        confirm.id = 'confirm-backup-restore';
        confirm.textContent = '确认恢复完整备份';
        confirm.disabled = true;
        check.querySelector('input')!.onchange = event => { confirm.disabled = !(event.target as HTMLInputElement).checked; };
        confirm.onclick = () => void run(async () => {
          prepare();
          await saveNow(state);
          const previous = librarySnapshot(state);
          previous.restorePoint = null;
          const next = clone(result.data);
          next.restorePoint = previous;
          await apply(next);
        });
        preview.append(text, check, confirm);
      } catch (failure) { if (current === generation) error(failure); }
    });
    sheet.querySelector('#restore-previous')?.addEventListener('click', () => {
      openSheet('撤回备份恢复', '<p class="hint">将回到上次导入备份前的完整书库，覆盖恢复备份后所做的修改。当前书库将交换为新的恢复点。</p><button class="primary" id="confirm-previous">确认恢复之前书库</button><p id="recovery-error" class="error" role="alert"></p>');
      sheet.querySelector('#confirm-previous')!.addEventListener('click', () => void run(async () => {
        prepare();
        await saveNow(state);
        const previous = clone(state.restorePoint);
        const current = librarySnapshot(state);
        current.restorePoint = null;
        previous.restorePoint = current;
        await apply(previous);
      }));
    });
  }
  return { recovery, backup };
}

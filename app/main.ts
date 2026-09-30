import { installPickers } from './features/editor/pickers';
import { installViewport } from './features/editor/viewport';
import { localDate } from './kit/date';

installPickers();
installViewport();

async function exportRawRows(button: HTMLButtonElement, result: HTMLElement) {
  button.disabled = true;
  result.textContent = '';
  try {
    const { openStorage } = await import('./data/storage');
    const { saveDocument } = await import('./features/txt/files');
    const rows = await (await openStorage()).read();
    const payload = JSON.stringify({ format: 'moye-raw-rows', exported: new Date().toISOString(), rows: [...rows] });
    const saved = await saveDocument(`墨页原始数据-${localDate()}.json`, payload, 'application/json');
    result.textContent = saved === 'cancelled' ? '已取消导出' : '原始数据已导出';
  } catch (error) {
    result.textContent = '导出失败：' + String(error);
  } finally {
    button.disabled = false;
  }
}

async function start() {
  // 读库超过 300 毫秒时先给一行提示，避免白屏等待。
  const bootTimer = setTimeout(() => {
    const root = document.getElementById('app');
    if (root && !root.childElementCount) {
      const boot = document.createElement('p');
      boot.className = 'boot';
      boot.setAttribute('role', 'status');
      boot.textContent = '正在打开书库…';
      root.append(boot);
    }
  }, 300);
  try {
    await import('./app');
    clearTimeout(bootTimer);
  } catch (error) {
    console.error('启动失败', error);
    clearTimeout(bootTimer);
    const root = document.getElementById('app')!;
    root.replaceChildren();
    const message = document.createElement('p');
    message.textContent = '无法读取本地数据，未覆盖已有内容。' + String(error);
    const retry = document.createElement('button');
    retry.textContent = '重新读取';
    retry.onclick = () => location.reload();
    const exportButton = document.createElement('button');
    exportButton.textContent = '导出原始数据';
    const exportResult = document.createElement('p');
    exportButton.onclick = () => void exportRawRows(exportButton, exportResult);
    root.append(message, retry, exportButton, exportResult);
    document.querySelector('.save-status')?.remove();
  }
}
void start();

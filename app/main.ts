import { installPickers } from './features/editor/pickers';
installPickers();
import { installViewport } from './features/editor/viewport';
installViewport();
async function start() {
  try {
    await import('./prototype.js');
  } catch (error) {
    console.error('启动失败', error);
    const root = document.getElementById('app')!;
    root.replaceChildren();
    const message = document.createElement('p');
    message.textContent = '无法读取本地数据，未覆盖已有内容。' + String(error);
    const retry = document.createElement('button');
    retry.textContent = '重新读取';
    retry.onclick = () => location.reload();
    root.append(message, retry);
    document.querySelector('.save-status')?.remove();
  }
}
void start();

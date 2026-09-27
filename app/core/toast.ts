import { $ } from './dom';

export type ToastAction = { label: string; run: () => void };

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastAction: (() => void) | null = null;

export function toast(message: string, action?: ToastAction) {
  clearTimeout(toastTimer);
  const notice = $('#notice');
  toastAction = action?.run ?? null;
  notice.replaceChildren(document.createTextNode(message));
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'notice-action';
    button.dataset.action = 'notice-action';
    button.textContent = action.label;
    notice.append(button);
  }
  notice.classList.toggle('with-action', !!action);
  notice.classList.add('visible');
  const duration = action ? 5000 : Math.min(8000, Math.max(2600, message.length * 120));
  toastTimer = setTimeout(() => { notice.classList.remove('visible', 'with-action'); toastAction = null; }, duration);
}

// 动作 notice-action：执行提示条上挂的操作并隐藏提示条。
export function runNoticeAction() {
  const run = toastAction;
  clearTimeout(toastTimer);
  const notice = $('#notice');
  notice.classList.remove('visible', 'with-action');
  toastAction = null;
  run?.();
}

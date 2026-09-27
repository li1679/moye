let picker: HTMLDialogElement | undefined;

// 新版 Chromium 的 dialog close 事件是异步派发的：close() 返回后 aria-label 还会挂一小会儿，
// 页面上出现两个相同 aria-label 的元素。关闭前先同步移除，屏幕阅读器和测试都不再有歧义。
function closeDialogOf(dialog: HTMLDialogElement) {
  dialog.removeAttribute('aria-label');
  dialog.close();
}

export function closePicker(): boolean {
  if (!picker?.open) return false;
  closeDialogOf(picker);
  return true;
}

function showPicker(title: string, control: HTMLElement) {
  closePicker();
  const dialog = document.createElement('dialog');
  dialog.className = 'app-picker';
  dialog.setAttribute('aria-label', title);
  const header = document.createElement('header');
  header.className = 'sheet-head';
  const heading = document.createElement('h2');
  heading.textContent = title;
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'text-action';
  cancel.textContent = '取消';
  cancel.onclick = () => closeDialogOf(dialog);
  header.append(heading, cancel);
  const content = document.createElement('div');
  content.className = 'sheet-content';
  dialog.append(header, content);
  document.body.append(dialog);
  picker = dialog;
  dialog.addEventListener('close', () => {
    dialog.inert = true;
    dialog.removeAttribute('aria-label');
    dialog.classList.add('picker-exiting');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) dialog.remove();
    else {
      dialog.addEventListener('transitionend', event => {
        if (event.target === dialog && event.propertyName === 'opacity') dialog.remove();
      });
      setTimeout(() => dialog.remove(), 240);
    }
    if (picker === dialog) picker = undefined;
    if (control.isConnected) control.focus({ preventScroll: true });
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientY < rect.top || event.clientX < rect.left || event.clientX > rect.right || event.clientY > rect.bottom) closeDialogOf(dialog);
  });
  // Escape 键关闭：cancel 事件同步派发，先移除 aria-label 再关闭。
  dialog.addEventListener('cancel', () => dialog.removeAttribute('aria-label'));
  return { dialog, content };
}


function selectPicker(select: HTMLSelectElement) {
  const title = select.getAttribute('aria-label') || select.closest('label')?.querySelector('span')?.textContent || '选择';
  const { dialog, content } = showPicker(title, select);
  content.setAttribute('role', 'listbox');
  content.setAttribute('aria-label', title);
  let selected: HTMLButtonElement | undefined;
  for (const [index, option] of Array.from(select.options).entries()) {
    const button = document.createElement('button');
    button.className = 'picker-option';
    button.type = 'button';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-label', option.text);
    button.setAttribute('aria-selected', String(option.selected));
    button.textContent = option.text;
    button.disabled = option.disabled || (option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled);
    button.onclick = () => {
      if (!select.isConnected || select.disabled) { closeDialogOf(dialog); return; }
      select.selectedIndex = index;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      closeDialogOf(dialog);
    };
    if (option.selected) selected = button;
    content.append(button);
  }
  content.addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(content.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
    buttons[next]?.focus();
  });
  dialog.showModal();
  selected?.focus({ preventScroll: true });
  selected?.scrollIntoView({ block: 'nearest' });
}

function colorPicker(input: HTMLInputElement) {
  const { dialog, content } = showPicker(input.getAttribute('aria-label') || '自定义颜色', input);
  const form = document.createElement('form');
  form.className = 'color-picker-form';
  form.innerHTML = '<div class="color-preview" aria-label="颜色预览"></div><label class="form-field"><span>颜色值</span><input aria-label="颜色值" type="text" maxlength="7" pattern="#[0-9a-fA-F]{6}" required spellcheck="false"></label>';
  const hex = form.querySelector<HTMLInputElement>('input')!;
  const preview = form.querySelector<HTMLElement>('.color-preview')!;
  hex.value = input.value;
  const ranges = ['红', '绿', '蓝'].map(name => {
    const label = document.createElement('label');
    label.className = 'color-channel';
    const span = document.createElement('span');
    span.textContent = name;
    const range = document.createElement('input');
    range.type = 'range'; range.min = '0'; range.max = '255';
    range.setAttribute('aria-label', name);
    const value = document.createElement('output');
    label.append(span, range, value);
    form.append(label);
    return { range, value };
  });
  const sync = () => {
    if (!/^#[\da-f]{6}$/i.test(hex.value)) return;
    preview.style.backgroundColor = hex.value;
    ranges.forEach(({ range, value }, i) => { range.value = String(parseInt(hex.value.slice(1 + i * 2, 3 + i * 2), 16)); value.textContent = range.value; });
  };
  hex.addEventListener('input', () => { sync(); error.textContent = ''; });
  ranges.forEach(({ range }) => range.addEventListener('input', () => {
    hex.value = '#' + ranges.map(item => Number(item.range.value).toString(16).padStart(2, '0')).join('');
    sync();
    error.textContent = '';
  }));
  const error = document.createElement('p');
  error.className = 'error'; error.setAttribute('role', 'alert');
  const confirm = document.createElement('button');
  confirm.className = 'primary'; confirm.textContent = '应用颜色';
  form.append(error, confirm);
  form.noValidate = true;
  form.addEventListener('submit', event => {
    event.preventDefault(); event.stopPropagation();
    if (!/^#[\da-f]{6}$/i.test(hex.value)) { error.textContent = '请输入六位颜色值，例如 #287c9d'; return; }
    if (input.isConnected && !input.disabled) {
      input.value = hex.value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    closeDialogOf(dialog);
  });
  content.append(form);
  sync(); dialog.showModal();
  // Start on a button so opening the color picker doesn't open the keyboard.
  confirm.focus({ preventScroll: true });
}

export function installPickers() {
  const target = (event: Event) => event.target instanceof Element ? event.target.closest<HTMLSelectElement | HTMLInputElement>('select, input[type="color"]') : null;
  const open = (control: HTMLSelectElement | HTMLInputElement) => {
    if (control.disabled) return;
    if (control instanceof HTMLSelectElement) selectPicker(control); else colorPicker(control);
  };
  document.addEventListener('pointerdown', event => { if (target(event)) event.preventDefault(); }, true);
  document.addEventListener('click', event => {
    const control = target(event);
    if (!control) return;
    event.preventDefault(); event.stopPropagation(); open(control);
  }, true);
  document.addEventListener('keydown', event => {
    const control = target(event);
    if (!control || !['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault(); open(control);
  }, true);
}

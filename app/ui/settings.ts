import type { SheetOptions } from './sheets';
import type { IconName } from '../kit/icons';
import { contrastRatio } from '../kit/contrast';
import type { Prefs, ReadPrefs } from '../data/schema';

export type EditorPreferences = Prefs;
export type ReaderPreferences = ReadPrefs;
type Context = { state: { prefs: EditorPreferences; readPrefs: ReaderPreferences; settingTab: string }; openSheet: (title: string, body: string, options?: SheetOptions) => void; icon: (name: IconName) => string };

const paperColors = ['#f6f1e7', '#fbf8f2', '#ffffff', '#efe2c8', '#e4ede4', '#e7ecef', '#f1e9e4', '#dcd3c3', '#e9e4f0', '#1b1a18', '#232527', '#2b2a27'];
const inkColors = ['#1f1d1a', '#3b3630', '#5f5a52', '#2f3b36', '#27313d', '#4a3a2c', '#6b5444', '#3d5a73', '#b33a2e', '#e9e4da', '#d9d3c7', '#b3ab9f'];
const readPaperColors = ['#f6f1e7', '#fbf8f2', '#ffffff', '#efe2c8', '#e4ede4', '#e7ecef'];
const readInkColors = ['#1f1d1a', '#3b3630', '#2f3b36', '#27313d', '#4a3a2c', '#5f5a52', '#b33a2e'];
export const presets = [
  { name: '宣纸', paper: '#f6f1e7', color: '#1f1d1a' },
  { name: '月白', paper: '#fbf8f2', color: '#27313d' },
  { name: '牛皮', paper: '#efe2c8', color: '#3b2f22' },
  { name: '竹青', paper: '#e4ede4', color: '#2f3b36' },
  { name: '夜读', paper: '#1b1a18', color: '#d9d3c7' },
] as const;
const tabs = ['版面', '字体', '主题', '排版规则'];

export function createSettings({ state, openSheet, icon }: Context) {
  const switchRow = (label: string, key: keyof EditorPreferences) => `<label class="row"><span>${label}</span><input class="switch" type="checkbox" data-pref="${key}" ${state.prefs[key] ? 'checked' : ''}></label>`;
  const readSwitchRow = (label: string, key: keyof ReaderPreferences) => `<label class="row"><span>${label}</span><input class="switch" type="checkbox" data-read-switch="${key}" ${state.readPrefs[key] ? 'checked' : ''}></label>`;
  const steps = (label: string, key: string, values: (string | number)[], current: string | number) => `<div class="setting-label">${label}</div><div class="steps" role="group" aria-label="${label}">${values.map(value => `<button aria-pressed="${String(value) === String(current)}" class="${String(value) === String(current) ? 'selected' : ''}" data-action="pref:${key}:${value}">${value}</button>`).join('')}</div>`;
  const swatches = (label: string, key: string, colors: string[], current: string) => `<div class="setting-label">${label}</div><div class="swatches" role="group" aria-label="${label}">${colors.map(color => `<button class="swatch ${current === color ? 'selected' : ''}" aria-pressed="${current === color}" style="--swatch:${color}" aria-label="${label} ${color}" title="${color}" data-action="pref:${key}:${color}"></button>`).join('')}<label class="swatch custom" title="自定义颜色">${icon('plus')}<input aria-label="自定义${label}" type="color" value="${current}" data-color="${key}"></label></div>`;
  const presetButtons = (kind: 'theme' | 'read', paper: string, color: string) => `<div class="setting-label">配色预设</div><div class="steps theme-presets" role="group" aria-label="配色预设">${presets.map((preset, index) => { const selected = preset.paper === paper && preset.color === color; return `<button class="${selected ? 'selected' : ''}" aria-pressed="${selected}" data-action="${kind}-preset:${index}">${preset.name}</button>`; }).join('')}</div>`;
  const warning = (kind: 'theme' | 'read', paper: string, color: string) => { const ratio = contrastRatio(color, paper); return `<p class="contrast-warning" data-contrast="${kind}" role="status" ${ratio >= 4.5 ? 'hidden' : ''}>字色和纸色的对比度只有 ${ratio.toFixed(1)}:1，可能看不清。</p>`; };

  function settings(tab = state.settingTab) {
    if (!tabs.includes(tab)) tab = '版面';
    state.settingTab = tab; const p = state.prefs; let body = '';
    if (tab === '版面') body = `<button class="row" data-action="layout"><span>页面布局</span>${icon('chevron-right')}</button><button class="row" data-action="grid"><span>网格线</span><span class="row-value">${p.grid ? '已开启' : '已关闭'}</span>${icon('chevron-right')}</button>` + steps('左右边距', 'margin', [16, 20, 24, 28, 32], p.margin) + steps('正文底部间距', 'bottom', [24, 40, 80, 120, 160], p.bottom);
    if (tab === '字体') body = switchRow('字体加粗', 'bold') + `<label class="row"><span>字体</span><select id="font-family"><option ${p.fontFamily === '系统默认' ? 'selected' : ''}>系统默认</option><option ${p.fontFamily === '宋体' ? 'selected' : ''}>宋体</option><option ${p.fontFamily === '黑体' ? 'selected' : ''}>黑体</option></select></label>` + steps('字体大小', 'font', [14, 16, 18, 20, 22, 24, 26, 28], p.font) + steps('行间距', 'line', [1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2, 2.2], p.line);
    if (tab === '主题') body = presetButtons('theme', p.paper, p.color) + swatches('字体颜色', 'color', inkColors, p.color) + swatches('纸张颜色', 'paper', paperColors, p.paper) + warning('theme', p.paper, p.color);
    if (tab === '排版规则') body = '<p class="hint">以下规则只在点“一键排版”时使用，不会改变当前显示。</p>' + switchRow('段落缩进', 'indent') + switchRow('去除多余空格', 'spaces') + steps('段落间隔行数', 'paragraph', ['不限', 0, 1, 2, 3], p.paragraph);
    openSheet('', body, { className: 'settings-sheet', label: '显示设置', header: `<div class="sheet-tabs" role="tablist" aria-label="设置分类">${tabs.map(value => `<button role="tab" aria-selected="${value === tab}" class="${value === tab ? 'active' : ''}" data-action="settings:${value}">${value}</button>`).join('')}</div>` });
  }

  function gridSettings() {
    const p = state.prefs;
    openSheet('网格线', switchRow('显示网格线', 'grid') + switchRow('线条靠近文字底部', 'near') + switchRow('线条加粗显示', 'thick') + `<div class="setting-label">线条类型</div><div class="line-types" role="group" aria-label="线条类型">${['实线', '长虚线', '短虚线', '点线'].map((value, index) => `<button class="line-choice ${p.lineType === value ? 'selected' : ''}" aria-pressed="${p.lineType === value}" data-action="line:${value}" style="--sample:${['solid', 'dashed', 'dashed', 'dotted'][index]}"><i></i><i></i><i></i><span>${value}</span></button>`).join('')}</div>` + swatches('线条颜色', 'lineColor', ['#dadde0', '#989b9d', '#e5e5e5', '#dbd4ca', '#ecd6d9'], p.lineColor), { className: 'settings-sheet' });
  }

  function readerSettings() {
    const p = state.readPrefs;
    openSheet('阅读设置', readSwitchRow('点击翻页', 'tapPaging') + presetButtons('read', p.paper, p.color) + `<div class="setting-label">亮度</div><input aria-label="阅读亮度" data-reader-pref="brightness" type="range" min="35" max="100" value="${p.brightness}">` + steps('阅读字体', 'readfontFamily', ['系统默认', '宋体', '黑体'], p.fontFamily) + steps('段落整理', 'readtidy', ['关', '紧凑', '宽松'], p.tidy) + steps('字体大小', 'readfont', [16, 18, 20, 22, 24, 26], p.font) + steps('行间距', 'readline', [1.4, 1.6, 1.8, 2, 2.2], p.line) + steps('左右边距', 'readmargin', [16, 20, 24, 28, 32], p.margin ?? 24) + steps('底部留白', 'readbottom', [24, 40, 80, 120, 160], p.bottom ?? 80) + swatches('背景颜色', 'readpaper', readPaperColors, p.paper) + swatches('字体颜色', 'readcolor', readInkColors, p.color) + warning('read', p.paper, p.color), { className: 'settings-sheet reader-settings-sheet' });
  }

  function syncPreferenceControls() {
    document.querySelectorAll<HTMLButtonElement>('#sheet [data-action^="pref:"]').forEach(button => {
      const [, key, value] = button.dataset.action!.split(':');
      const current = key.startsWith('read') ? state.readPrefs[key.slice(4) as keyof ReaderPreferences] : state.prefs[key as keyof EditorPreferences];
      const selected = String(current) === value; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll<HTMLInputElement>('#sheet [data-color]').forEach(input => {
      const key = input.dataset.color!; const value = key.startsWith('read') ? state.readPrefs[key.slice(4) as keyof ReaderPreferences] : state.prefs[key as keyof EditorPreferences];
      if (typeof value === 'string') input.value = value;
    });
    document.querySelectorAll<HTMLButtonElement>('#sheet [data-action^="theme-preset:"], #sheet [data-action^="read-preset:"]').forEach(button => {
      const read = button.dataset.action!.startsWith('read-');
      const current = read ? state.readPrefs : state.prefs;
      const preset = presets[Number(button.dataset.action!.split(':')[1])];
      const selected = preset?.paper === current.paper && preset.color === current.color;
      button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll<HTMLElement>('#sheet [data-contrast]').forEach(element => {
      const current = element.dataset.contrast === 'read' ? state.readPrefs : state.prefs;
      const ratio = contrastRatio(current.color, current.paper);
      element.hidden = ratio >= 4.5;
      element.textContent = `字色和纸色的对比度只有 ${ratio.toFixed(1)}:1，可能看不清。`;
    });
  }

  return { settings, gridSettings, readerSettings, syncPreferenceControls };
}

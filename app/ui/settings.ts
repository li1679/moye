import type { SheetOptions } from './sheets';
import type { IconName } from '../kit/icons';
import type { Prefs, ReadPrefs } from '../data/schema';
export type EditorPreferences = Prefs;
export type ReaderPreferences = ReadPrefs;
type Context = { state: { prefs: EditorPreferences; readPrefs: ReaderPreferences; settingTab: string }; openSheet: (title: string, body: string, options?: SheetOptions) => void; icon: (name: IconName) => string };
const inkColors = ['#292d30','#85a8c1','#509499','#6faab4','#527db3','#7c6854','#527b80','#6979ad','#b55353','#8bb98a','#554f43','#aa537c','#64727d','#c2a773'];
const paperColors = ['#ffffff','#f4f5f5','#eff7f7','#dce8f4','#f2e6d4','#dcead8','#e8dfd0','#e7e4f2','#f5e9ed','#e4f3ee','#f2dfe1','#d9e9eb'];
const tabs = ['基础','字体','排版','主题'];
export function createSettings({ state, openSheet, icon }: Context) {
  const switchRow = (label: string, key: keyof EditorPreferences) => `<label class="row"><span>${label}</span><input class="switch" type="checkbox" data-pref="${key}" ${state.prefs[key] ? 'checked' : ''}></label>`;
  const steps = (label: string, key: string, values: (string | number)[], current: string | number) => `<div class="setting-label">${label}</div><div class="steps" role="group" aria-label="${label}">${values.map(value => `<button aria-pressed="${String(value) === String(current)}" class="${String(value) === String(current) ? 'selected' : ''}" data-action="pref:${key}:${value}">${value}</button>`).join('')}</div>`;
  const swatches = (label: string, key: string, colors: string[], current: string) => `<div class="setting-label">${label}</div><div class="swatches" role="group" aria-label="${label}">${colors.map(color => `<button class="swatch ${current === color ? 'selected' : ''}" aria-pressed="${current === color}" style="--swatch:${color}" aria-label="${label} ${color}" title="${color}" data-action="pref:${key}:${color}"></button>`).join('')}<label class="swatch custom" title="自定义颜色">${icon('plus')}<input aria-label="自定义${label}" type="color" value="${current}" data-color="${key}"></label></div>`;
  function settings(tab = state.settingTab) {
    if (!tabs.includes(tab)) tab = '基础';
    state.settingTab = tab; const p = state.prefs; let body = '';
    if (tab === '基础') body = `<button class="row" data-action="layout"><span>页面布局</span>${icon('chevron-right')}</button><button class="row" data-action="grid"><span>网格线</span><span class="row-value">${p.grid ? '已开启' : '已关闭'}</span>${icon('chevron-right')}</button><button class="row" data-action="chapter-search"><span>本章搜索</span>${icon('chevron-right')}</button><button class="row" data-action="export"><span>导出文档</span><span class="row-value">TXT</span>${icon('chevron-right')}</button>`;
    if (tab === '字体') body = switchRow('字体加粗','bold') + `<label class="row"><span>字体设置</span><select id="font-family"><option ${p.fontFamily === '系统默认' ? 'selected' : ''}>系统默认</option><option ${p.fontFamily === '宋体' ? 'selected' : ''}>宋体</option></select></label>` + steps('字体大小','font',[14,16,18,20,22,24,26,28],p.font) + steps('行间距','line',[1.4,1.5,1.6,1.7,1.8,1.9,2,2.2],p.line);
    if (tab === '排版') body = switchRow('段落缩进','indent') + switchRow('去除多余空格','spaces') + steps('段落间隔行数','paragraph',['不限',0,1,2,3],p.paragraph) + steps('左右边距','margin',[16,20,24,28,32],p.margin) + steps('正文底部间距','bottom',[24,40,80,120,160],p.bottom);
    if (tab === '主题') body = swatches('字体颜色','color',inkColors,p.color) + swatches('纯色背景','paper',paperColors,p.paper) + '<div class="setting-label">默认背景</div><div class="backgrounds"><button style="background:#fff;color:#333" data-action="theme-light:#ffffff">白纸</button><button style="background:#e4f3ee;color:#35554a" data-action="theme-light:#e4f3ee">浅绿</button><button style="background:#232527;color:#ddd" data-action="theme-dark">夜间</button></div>';
    openSheet('', body, { className: 'settings-sheet', label: '界面设置', header: `<div class="sheet-tabs" role="tablist" aria-label="设置分类">${tabs.map(value => `<button role="tab" aria-selected="${value === tab}" class="${value === tab ? 'active' : ''}" data-action="settings:${value}">${value}</button>`).join('')}</div>` });
  }
  function gridSettings() {
    const p = state.prefs;
    openSheet('网格线', switchRow('显示网格线','grid') + switchRow('线条靠近文字底部','near') + switchRow('线条加粗显示','thick') + `<div class="setting-label">线条类型</div><div class="line-types" role="group" aria-label="线条类型">${['实线','长虚线','短虚线','点线'].map((value,index) => `<button class="line-choice ${p.lineType === value ? 'selected' : ''}" aria-pressed="${p.lineType === value}" data-action="line:${value}" style="--sample:${['solid','dashed','dashed','dotted'][index]}"><i></i><i></i><i></i><span>${value}</span></button>`).join('')}</div>` + swatches('线条颜色','lineColor',['#dadde0','#989b9d','#e5e5e5','#dbd4ca','#ecd6d9'],p.lineColor), { className:'settings-sheet' });
  }
  function readerSettings() {
    const p = state.readPrefs;
    openSheet('阅读设置', `<div class="setting-label">亮度</div><input aria-label="阅读亮度" data-reader-pref="brightness" type="range" min="35" max="100" value="${p.brightness}">` + steps('字体大小','readfont',[16,18,20,22,24,26],p.font) + steps('行间距','readline',[1.4,1.6,1.8,2,2.2],p.line) + steps('左右边距','readmargin',[16,20,24,28,32],p.margin ?? 24) + steps('底部留白','readbottom',[24,40,80,120,160],p.bottom ?? 80) + swatches('背景颜色','readpaper',paperColors.slice(0,6),p.paper) + swatches('字体颜色','readcolor',inkColors.slice(0,7),p.color), { className:'settings-sheet reader-settings-sheet' });
  }
  function syncPreferenceControls() {
    document.querySelectorAll<HTMLButtonElement>('#sheet [data-action^="pref:"]').forEach(button => {
      const [,key,value] = button.dataset.action!.split(':');
      const current = key.startsWith('read') ? state.readPrefs[key.slice(4) as keyof ReaderPreferences] : state.prefs[key as keyof EditorPreferences];
      const selected = String(current) === value; button.classList.toggle('selected',selected); button.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll<HTMLInputElement>('#sheet [data-color]').forEach(input => {
      const key = input.dataset.color!; const value = key.startsWith('read') ? state.readPrefs[key.slice(4) as keyof ReaderPreferences] : state.prefs[key as keyof EditorPreferences];
      if (typeof value === 'string') input.value = value;
    });
  }
  return { settings, gridSettings, readerSettings, syncPreferenceControls };
}

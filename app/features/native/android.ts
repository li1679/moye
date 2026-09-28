import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { App } from '@capacitor/app';
import { closePicker } from '../editor/pickers';
import { saveNow } from '../../data/autosave';
import type { Ctx } from '../../core/context';

// 安卓返回键与切后台保存（2.10 从 prototype.js 拆出）。仅在原生平台生效。
export async function installNativeHandlers(ctx: Ctx): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const state = ctx.state;
  const dispatch = ctx.action;
  await App.addListener('backButton', async () => {
    try {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.matches('[contenteditable], input:not([type="range"]):not([type="color"]):not([type="checkbox"]):not([type="file"]), textarea')) {
        active.blur();
        await Keyboard.hide();
        return;
      }
      if (closePicker()) return;
      if (ctx.sheet.open) { ctx.sheet.dispatchEvent(new Event('cancel', { cancelable: true })) && ctx.closeSheet(); return; }
      if (state.chapterBatch) { await dispatch('finish-chapters'); return; }
      if (state.batch) { await dispatch('batch'); return; }
      if (state.layout) { await dispatch('finish-layout'); return; }
      if (state.page === 'editor') { await dispatch('chapters'); return; }
      if (state.page === 'reader' || state.page === 'chapters') { await dispatch('home'); return; }
      if (state.folder !== null) { await dispatch('folder:root'); return; }
      if (state.tab !== 'edit') { await dispatch('tab:edit'); return; }
      await saveNow(state);
      await App.exitApp();
    } catch (error) { ctx.toast('返回未完成：' + String(error)); }
  });
  await App.addListener('appStateChange', async ({ isActive }) => {
    if (isActive) return;
    ctx.reader.session()?.save();
    document.dispatchEvent(new Event('visibilitychange'));
    try { await saveNow(state); }
    catch (error) { console.error('后台保存未完成', error); }
  });
}

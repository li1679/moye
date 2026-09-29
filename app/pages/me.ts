import { $ } from '../core/dom';
import { icon } from '../kit/ui';
import { MoyeNative, isNative } from '../features/native/native';
import { nav } from './shelf';
import type { ActionHandler, Ctx, PageModule } from '../core/context';

export function createMePage(ctx: Ctx): PageModule {
  const state = ctx.state;

  function render() {
    ctx.app.innerHTML = `<main class="app-shell home"><header class="topbar"><h1>设置</h1></header><section class="page-body profile"><div class="profile-intro"><div class="avatar"><img src="/brand/moye.svg" alt="" width="48" height="48"></div><div><h2>墨页 ${__APP_VERSION__}</h2><p class="muted">本地阅读，随心改文</p></div></div><h2 class="setting-label">数据</h2><button class="row" data-action="import"><span class="row-label">${icon('file-input')}导入 TXT</span>${icon('chevron-right')}</button><button class="row" data-action="backup"><span class="row-label">${icon('archive')}完整备份与恢复</span>${icon('chevron-right')}</button><button class="row" data-action="cache"><span class="row-label">${icon('eraser')}清理缓存</span>${icon('chevron-right')}</button><h2 class="setting-label">关于</h2><button class="row" data-action="about"><span class="row-label">${icon('info')}关于墨页</span>${icon('chevron-right')}</button></section>${nav(state.tab)}</main>`;
  }

  const actions: Record<string, ActionHandler> = {
    cache() {
      ctx.openSheet('清理缓存', '<p class="hint">只清理临时文件，不删除书籍、设置或备份。</p><button class="primary" data-action="clear-cache">清理缓存</button><p id="cache-result" role="status"></p>');
    },
    async 'clear-cache'() {
      const button = $<HTMLButtonElement>('[data-action="clear-cache"]');
      button.disabled = true;
      try {
        if (isNative) await MoyeNative.clearCache();
        else for (const key of await caches.keys()) await caches.delete(key);
        $<HTMLElement>('#cache-result').textContent = '缓存已清理';
      } catch (error) { $<HTMLElement>('#cache-result').textContent = '清理失败：' + String(error); }
      finally { button.disabled = false; }
    },
    about() {
      ctx.openSheet(
        '关于',
        `<div class="empty"><img src="/brand/moye.svg" alt="" width="72" height="72"><h2>墨页 ${__APP_VERSION__}</h2><p class="hint">本地阅读，随心改文</p><p class="hint">所有数据只保存在本机，不联网。</p></div>`,
      );
    },
  };

  return { actions, render };
}

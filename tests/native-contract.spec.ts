import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import config from '../capacitor.config';

// 源码契约，不替代 Android 真机对系统栏/键盘的验收。
const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('音量键拦截和前后端翻页桥接均已移除', () => {
  const paths = [
    'android/app/src/main/java/com/localediting/app/MainActivity.java',
    'android/app/src/main/java/com/localediting/app/MoyeNativePlugin.kt',
    'app/features/native/native.ts', 'app/pages/reader.ts', 'app/ui/settings.ts',
  ];
  for (const path of paths) expect(read(path)).not.toMatch(/volumePaging|volumeKey|setVolumePaging|KEYCODE_VOLUME|dispatchKeyEvent/);
});

test('全屏安全区由统一插件管理，包含键盘和系统栏主题恢复', () => {
  expect(config.plugins?.SystemBars.insetsHandling).toBe('disable');
  expect(read('app/index.html')).toContain('viewport-fit=cover');
  const native = read('android/app/src/main/java/com/localediting/app/MoyeNativePlugin.kt');
  for (const token of ['setDecorFitsSystemWindows(window, false)', 'Color.TRANSPARENT',
    'isNavigationBarContrastEnforced = false', 'Type.displayCutout()', 'Type.ime()',
    '--safe-area-inset-top', '--safe-area-inset-bottom', 'onPageCommitVisible',
    'handleOnConfigurationChanged', 'handleOnResume', 'isAppearanceLightStatusBars = !darkTheme']) {
    expect(native).toContain(token);
  }
});

import { test, expect } from '@playwright/test';

// 只模拟桥接边界，不模拟 Android 系统栏本身。
test.beforeEach(async ({ page }) => {
  await page.route('**/native-probe', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
  await page.goto('/native-probe');
  await page.evaluate(() => {
    const win = window as any;
    win.androidBridge = {};
    win.nativeCalls = [];
    win.failBrightness = false;
    win.Capacitor = {
      PluginHeaders: [{ name: 'MoyeNative', methods: ['setKeepScreenOn', 'setBrightness', 'setImmersive', 'setTheme'].map(name => ({ name, rtype: 'promise' })) }],
      nativePromise(_plugin: string, method: string, options: unknown) {
        win.nativeCalls.push({ method, options });
        return method === 'setBrightness' && win.failBrightness ? Promise.reject(new Error('测试桥接失败')) : Promise.resolve();
      },
    };
  });
});

test('brightness changes do not resend keep-awake and immersive commands', async ({ page }) => {
  const calls = await page.evaluate(async () => {
    const win = window as any;
    const native = await import('/features/native/native.ts');
    const { DEFAULT_READ_PREFS } = await import('/data/schema.ts');
    native.syncReader({ ...DEFAULT_READ_PREFS, brightnessAuto: false, brightness: 80 });
    await new Promise(resolve => setTimeout(resolve, 0));
    native.syncReader({ ...DEFAULT_READ_PREFS, brightnessAuto: false, brightness: 60 });
    await new Promise(resolve => setTimeout(resolve, 0));
    native.syncReader({ ...DEFAULT_READ_PREFS, brightnessAuto: false, brightness: 60 });
    await new Promise(resolve => setTimeout(resolve, 0));
    return win.nativeCalls;
  });
  expect(calls.filter((call: any) => call.method === 'setKeepScreenOn')).toHaveLength(1);
  expect(calls.filter((call: any) => call.method === 'setImmersive')).toHaveLength(1);
  expect(calls.filter((call: any) => call.method === 'setBrightness')).toHaveLength(2);
});

test('failed reader bridge calls are handled and identical settings can retry', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const calls = await page.evaluate(async () => {
    const win = window as any;
    const native = await import('/features/native/native.ts');
    const { DEFAULT_READ_PREFS } = await import('/data/schema.ts');
    win.failBrightness = true;
    native.syncReader(DEFAULT_READ_PREFS);
    await new Promise(resolve => setTimeout(resolve, 30));
    win.failBrightness = false;
    native.syncReader(DEFAULT_READ_PREFS);
    await new Promise(resolve => setTimeout(resolve, 30));
    return win.nativeCalls;
  });
  expect(errors).toEqual([]);
  expect(calls.filter((call: any) => call.method === 'setBrightness')).toHaveLength(2);
});

import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { ReadPrefs } from '../../data/schema';

type MoyeNativePlugin = {
  saveText(options: { name: string; text: string; mime?: string }): Promise<{ cancelled: boolean }>;
  clearCache(): Promise<{ count: number }>;
  setKeepScreenOn(options: { on: boolean }): Promise<void>;
  setBrightness(options: { value: number | null }): Promise<void>;
  setImmersive(options: { on: boolean }): Promise<void>;
  getBattery(): Promise<{ level: number; charging: boolean }>;
  setTheme(options: { paper: string; dark: boolean }): Promise<void>;
  addListener(event: 'shareReceived', listener: (data: { name?: string; data?: string; error?: string }) => void): Promise<PluginListenerHandle>;
};

export const MoyeNative = registerPlugin<MoyeNativePlugin>('MoyeNative');
export const isNative = Capacitor.isNativePlatform();

// 独立缓存各设置，亮度变化不重发系统栏命令；旧请求失败不能清掉新请求缓存。
function changedOnly<T>(send: (value: T) => Promise<void>, label: string): (value: T) => void {
  let applied: T | undefined;
  let revision = 0;
  return value => {
    if (!isNative || applied === value) return;
    applied = value;
    const current = ++revision;
    void send(value).catch(error => {
      if (current === revision) applied = undefined;
      console.error(label + '未更新', error);
    });
  };
}
const keepAwake = changedOnly((on: boolean) => MoyeNative.setKeepScreenOn({ on }), '屏幕常亮');
const brightness = changedOnly((value: number | null) => MoyeNative.setBrightness({ value }), '屏幕亮度');
const immersive = changedOnly((on: boolean) => MoyeNative.setImmersive({ on }), '沉浸阅读');
const theme = changedOnly((key: string) => {
  const [paper, dark] = JSON.parse(key) as [string, boolean];
  return MoyeNative.setTheme({ paper, dark });
}, '系统栏主题');

export function syncReader(prefs: ReadPrefs | null): void {
  keepAwake(!!prefs?.keepAwake);
  brightness(prefs && !prefs.brightnessAuto ? prefs.brightness / 100 : null);
  immersive(!!prefs?.immersive);
}

export function syncNativeTheme(paper: string, dark: boolean): void {
  theme(JSON.stringify([paper, dark]));
}

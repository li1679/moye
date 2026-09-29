import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

type MoyeNativePlugin = {
  saveText(options: { name: string; text: string; mime?: string }): Promise<{ cancelled: boolean }>;
  clearCache(): Promise<{ count: number }>;
  setKeepScreenOn(options: { on: boolean }): Promise<void>;
  setBrightness(options: { value: number | null }): Promise<void>;
  setImmersive(options: { on: boolean }): Promise<void>;
  getBattery(): Promise<{ level: number; charging: boolean }>;
  setVolumePaging(options: { on: boolean }): Promise<void>;
  addListener(event: 'volumeKey', listener: (data: { direction: 'up' | 'down' }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'shareReceived', listener: (data: { name?: string; data?: string; error?: string }) => void): Promise<PluginListenerHandle>;
};

export const MoyeNative = registerPlugin<MoyeNativePlugin>('MoyeNative');
export const isNative = Capacitor.isNativePlatform();

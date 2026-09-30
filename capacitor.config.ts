import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.localediting.app',
  appName: '墨页',
  webDir: 'dist',
  // MoyeNative 统一处理透明系统栏和安全区，避免旧 WebView 的原生留白。
  plugins: { SystemBars: { insetsHandling: 'disable', style: 'LIGHT' } },
  server: {
    androidScheme: 'https'
  }
};

export default config;

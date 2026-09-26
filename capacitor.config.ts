import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.localediting.app',
  appName: '墨页',
  webDir: 'dist',
  // Paired with viewport-fit=contain: SystemBars pads the native viewport on
  // every WebView version, including fixed headers and modal dialogs.
  plugins: { SystemBars: { insetsHandling: 'native' } },
  server: {
    androidScheme: 'https'
  }
};

export default config;

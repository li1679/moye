import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: {
    reducedMotion: 'reduce',
    channel: 'msedge',
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 482, height: 790 },
  },
});

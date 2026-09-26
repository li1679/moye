import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('.', import.meta.url)));

export default defineConfig({
  root: resolve(projectRoot, 'app'),
  build: {
    target: 'es2022',
    outDir: resolve(projectRoot, 'dist'),
    emptyOutDir: true,
  },
});

import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('.', import.meta.url)));
const pkg = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8')) as { version: string };

export default defineConfig({
  root: resolve(projectRoot, 'app'),
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    target: 'es2022',
    outDir: resolve(projectRoot, 'dist'),
    emptyOutDir: true,
  },
});

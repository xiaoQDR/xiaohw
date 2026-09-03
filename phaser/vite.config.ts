import { defineConfig } from 'vite';
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    chunkSizeWarningLimit: 1400,
  },
  plugins: [{
    name: 'copy-original-audio-assets',
    writeBundle() {
      const target = resolve(projectDir, 'dist/audio');
      mkdirSync(target, { recursive: true });
      cpSync(resolve(projectDir, '../legacy/audio'), target, { recursive: true });
    },
  }],
});

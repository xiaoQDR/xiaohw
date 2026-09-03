import { defineConfig } from 'vite';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = dirname(fileURLToPath(import.meta.url));

function copyClassicRuntime() {
  return {
    name: 'copy-classic-runtime',
    closeBundle() {
      const target = resolve(projectDir, 'dist/classic');
      rmSync(target, { recursive: true, force: true });
      cpSync(resolve(projectDir, '../legacy'), target, { recursive: true });
      cpSync(resolve(projectDir, 'classic/mobile-adapter.css'), join(target, 'mobile-adapter.css'));
      cpSync(resolve(projectDir, 'classic/mobile-adapter.js'), join(target, 'mobile-adapter.js'));

      const indexPath = join(target, 'index.html');
      let html = readFileSync(indexPath, 'utf8');
      html = html
        .replace(
          /\s*<script src="https:\/\/ajax\.googleapis\.com\/ajax\/libs\/jquery\/1\.10\.1\/jquery\.min\.js"><\/script>[\s\S]*?<\/script>/,
          '\n\t<script src="lib/jquery.min.js"></script>',
        )
        .replace(
          /\s*<!-- Google tag \(gtag\.js\) -->[\s\S]*?<\/script>/,
          '',
        )
        .replace(
          /\s*<script>\s*window\.dataLayer[\s\S]*?gtag\('config', 'G-606P6J79WH'\);\s*<\/script>/,
          '',
        )
        .replace(
          '<meta charset="UTF-8"/>',
          '<meta charset="UTF-8"/>\n\t<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no"/>',
        )
        .replace(
          '<link rel="stylesheet" type="text/css" href="css/fabricator.css" />',
          '<link rel="stylesheet" type="text/css" href="css/fabricator.css" />\n\t<link rel="stylesheet" type="text/css" href="mobile-adapter.css" />',
        )
        .replace('</body>', '\t<script src="mobile-adapter.js"></script>\n</body>');
      writeFileSync(indexPath, html);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [copyClassicRuntime()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    chunkSizeWarningLimit: 1400,
  },
});

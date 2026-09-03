import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = resolve(projectDir, '../legacy');
const outputDir = resolve(projectDir, 'dist/classic');
const generatedFiles = new Set(['index.html', 'mobile-adapter.css', 'mobile-adapter.js']);

function walk(root, current = '') {
  return readdirSync(join(root, current), { withFileTypes: true }).flatMap((entry) => {
    const path = join(current, entry.name);
    return entry.isDirectory() ? walk(root, path) : [path];
  });
}

function hash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const sourceFiles = walk(sourceDir).filter((path) => !generatedFiles.has(path));
const changed = sourceFiles.filter((path) => {
  const outputPath = join(outputDir, path);
  return !existsSync(outputPath) || hash(join(sourceDir, path)) !== hash(outputPath);
});

const required = [
  'script/events.js',
  'script/events/setpieces.js',
  'script/events/executioner.js',
  'script/world.js',
  'script/space.js',
  'script/prestige.js',
  'audio/ending.flac',
  'lang/zh_cn/strings.js',
];
const missing = required.filter((path) => !existsSync(join(outputDir, path)));

if (changed.length || missing.length) {
  console.error('Classic runtime verification failed.');
  changed.forEach((path) => console.error(`Changed or missing: ${relative(projectDir, join(sourceDir, path))}`));
  missing.forEach((path) => console.error(`Required file missing: dist/classic/${path}`));
  process.exit(1);
}

console.log(`Verified ${sourceFiles.length} original runtime files.`);

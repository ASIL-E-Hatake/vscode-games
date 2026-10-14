// ビルドスクリプト
// - 拡張ホスト: src/extension.ts → dist/extension.js（CommonJS / Node）
// - Webview:   src/features/<id>/webview/main.ts → dist/webview/<id>.js（+ .css）を自動検出
import * as esbuild from 'esbuild';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** src/features/*\/webview/main.ts を探してエントリにする */
function webviewEntries() {
  const featuresDir = 'src/features';
  const entries = {};
  for (const id of readdirSync(featuresDir, { withFileTypes: true })) {
    if (!id.isDirectory()) continue;
    const main = join(featuresDir, id.name, 'webview', 'main.ts');
    if (existsSync(main)) entries[id.name] = main;
  }
  return entries;
}

/** watch 時に VS Code のタスク（problemMatcher）へ開始・終了を知らせる */
const watchLogger = {
  name: 'watch-logger',
  setup(build) {
    build.onStart(() => console.log('[watch] build started'));
    build.onEnd((result) => {
      for (const { text, location } of result.errors) {
        console.error(`✘ [ERROR] ${text}`);
        if (location) console.error(`    ${location.file}:${location.line}:${location.column}:`);
      }
      console.log('[watch] build finished');
    });
  },
};

const common = {
  bundle: true,
  minify: production,
  sourcemap: !production,
  logLevel: 'warning',
  plugins: watch ? [watchLogger] : [],
};

const contexts = await Promise.all([
  esbuild.context({
    ...common,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['vscode'],
  }),
  esbuild.context({
    ...common,
    entryPoints: webviewEntries(),
    outdir: 'dist/webview',
    platform: 'browser',
    format: 'iife',
    target: 'chrome120',
  }),
]);

if (watch) {
  await Promise.all(contexts.map((ctx) => ctx.watch()));
} else {
  await Promise.all(contexts.map((ctx) => ctx.rebuild()));
  await Promise.all(contexts.map((ctx) => ctx.dispose()));
}

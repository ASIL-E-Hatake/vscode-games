// L5 パッケージ検証: 作成済みの vsix に必要なファイルが入っていて、不要なファイルが入っていないかを確認する
// 結果は test-results/package/ に JUnit XML と JSON で出力する。
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeJUnit, type JUnitCase } from './junit';
import { checkReleaseDocs } from './releaseDocs';

const MAX_VSIX_BYTES = 5 * 1024 * 1024;
const outDir = join('test-results', 'package');
mkdirSync(outDir, { recursive: true });

const pkg = JSON.parse(
  execFileSync('node', ['-p', 'JSON.stringify(require("./package.json"))'], { encoding: 'utf8' }),
) as {
  name: string;
  version: string;
  main: string;
  icon?: string;
  engines: { vscode: string };
  devDependencies: Record<string, string>;
  contributes: { viewsContainers?: { activitybar?: { icon: string }[] } };
};

// vsce ls は .vscodeignore を適用した「vsix に入るファイル」の一覧を返す
const vsceBin = join('node_modules', '@vscode', 'vsce', 'vsce');
const files = execFileSync('node', [vsceBin, 'ls', '--no-dependencies'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .map((line) => line.trim().replace(/\\/g, '/'))
  .filter(Boolean);

const webviewFeatures = readdirSync(join('src', 'features'), { withFileTypes: true })
  .filter(
    (d) => d.isDirectory() && existsSync(join('src', 'features', d.name, 'webview', 'main.ts')),
  )
  .map((d) => d.name);

const required = [
  'package.json',
  'README.md',
  'CHANGELOG.md',
  pkg.main.replace(/^\.\//, ''),
  'dist/content/links.json',
  'dist/content/tips.json',
  'dist/content/linux-commands.json',
  'dist/content/linux-recipes.json',
  'dist/content/git-recipes.json',
  'dist/content/cheatsheets.json',
  'dist/content/errors.json',
  'dist/content/output-quiz.json',
  'dist/content/bug-hunt.json',
  'dist/content/glossary.json',
  'dist/content/vscode-guide.json',
  'dist/content/typing.json',
  'dist/content/command-builder.json',
  'dist/content/achievements.json',
  'dist/content/ai-prompts.json',
  'dist/content/container-images.json',
  'dist/content/container-compose-services.json',
  ...webviewFeatures.map((id) => `dist/webview/${id}.js`),
  ...(pkg.contributes.viewsContainers?.activitybar ?? []).map((c) => c.icon),
  ...(pkg.icon ? [pkg.icon] : []),
];

const forbidden: [string, RegExp][] = [
  ['ソースコード（src/）', /^src\//],
  ['テスト（tests/）', /^tests\//],
  // L2（コンテナ）の検査用サンプル（tests/fixtures/container/）の中身がどこにも入っていない
  [
    'コンテナの検査用サンプル',
    /(^|\/)(pom\.xml|build\.gradle|settings\.gradle|[^/]+\.java|01-greeting\.sql)$/,
  ],
  ['node_modules', /^node_modules\//],
  ['ソースマップ', /\.map$/],
  ['TypeScript ファイル', /\.ts$/],
  ['テスト結果', /^(test-results|coverage|\.vscode-test)\//],
  ['環境変数ファイル', /(^|\/)\.env/],
];

const cases: JUnitCase[] = [];
const check = (name: string, ok: boolean, failure?: string) =>
  cases.push({ name, failure: ok ? undefined : failure });

for (const file of required) {
  check(`必須ファイル: ${file}`, files.includes(file), `${file} が vsix に含まれていません`);
}
for (const [label, pattern] of forbidden) {
  const hits = files.filter((f) => pattern.test(f));
  check(`混入禁止: ${label}`, hits.length === 0, `含まれています: ${hits.join(', ')}`);
}

const vsixPath = `${pkg.name}-${pkg.version}.vsix`;
const size = existsSync(vsixPath) ? statSync(vsixPath).size : -1;
check(`vsix が存在する: ${vsixPath}`, size >= 0, 'npm run package を先に実行してください');
check(
  `vsix のサイズが ${MAX_VSIX_BYTES / 1024 / 1024} MB 以下`,
  size >= 0 && size <= MAX_VSIX_BYTES,
  `${size} bytes`,
);

const minor = (range: string | undefined) => range?.match(/(\d+\.\d+)/)?.[1];
const engines = minor(pkg.engines.vscode);
const types = minor(pkg.devDependencies['@types/vscode']);
check(
  `engines.vscode と @types/vscode のバージョンが一致（${engines}）`,
  engines !== undefined && engines === types,
  `engines.vscode=${pkg.engines.vscode} / @types/vscode=${pkg.devDependencies['@types/vscode']}`,
);

// 拡張機能の一覧・詳細画面に出るアイコン（PNG 128×128 以上が推奨）
const icon = pkg.icon && existsSync(pkg.icon) ? readFileSync(pkg.icon) : undefined;
const isPng = icon?.subarray(1, 4).toString('ascii') === 'PNG';
const iconSize = icon && isPng ? [icon.readUInt32BE(16), icon.readUInt32BE(20)] : [];
check(
  'アイコン（package.json の icon）が 128×128 の PNG',
  isPng && iconSize[0] === 128 && iconSize[1] === 128,
  pkg.icon
    ? `${pkg.icon}: ${isPng ? iconSize.join('×') : 'PNG ではない／存在しない'}`
    : 'icon が未設定',
);

// リリースノートの書き忘れ防止: 現在の version の項目が CHANGELOG にあること
check(
  `CHANGELOG.md に version ${pkg.version} の項目がある`,
  readFileSync('CHANGELOG.md', 'utf8').includes(`## [${pkg.version}]`),
  `「## [${pkg.version}]」の見出しがありません`,
);

// リリースのときに一緒に直すドキュメント（ロードマップ・CLAUDE.md・試用ガイド）の書き忘れ防止
const docIssues = checkReleaseDocs({
  version: pkg.version,
  roadmap: readFileSync(join('docs', 'roadmap.md'), 'utf8'),
  claudeMd: readFileSync('CLAUDE.md', 'utf8'),
  trialGuide: readFileSync(join('docs', '05-trial-guide.md'), 'utf8'),
});
check(
  `ロードマップ・CLAUDE.md・試用ガイドが version ${pkg.version} のリリース済みに合っている`,
  docIssues.length === 0,
  docIssues.map((i) => `${i.file}: ${i.message}`).join(' / '),
);

writeJUnit(join(outDir, 'junit.xml'), 'L5 パッケージ検証', cases);
writeFileSync(
  join(outDir, 'package.json'),
  JSON.stringify({ vsix: vsixPath, sizeBytes: size, files }, null, 2),
);

const failed = cases.filter((c) => c.failure);
for (const c of cases)
  console.log(`${c.failure ? '✘' : '✔'} ${c.name}${c.failure ? ` — ${c.failure}` : ''}`);
console.log(
  `\n${cases.length - failed.length}/${cases.length} 件成功（vsix: ${files.length} ファイル, ${size} bytes）`,
);
if (failed.length > 0) process.exit(1);

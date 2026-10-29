// テスト結果のまとめレポートを生成する（docs/04-test-strategy.md 4 章）
// - test-results/summary.md : 要約（PR コメント・Job Summary・リリースノート用）
// - test-results/index.html : 要約 + スクリーンショットのギャラリー + 詳細レポートへのリンク
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { readJUnitFailures, readJUnitTotals, type JUnitTotals } from './junit';

const ROOT = 'test-results';

interface LayerResult {
  layer: string;
  name: string;
  env: string;
  totals?: JUnitTotals;
  failures: string[];
  /** 詳細レポート（test-results からの相対パス） */
  detail?: string;
}

const LAYERS: { layer: string; name: string; dir: string; detail?: string; multiEnv?: boolean }[] =
  [
    {
      layer: 'L1/L2',
      name: 'ユニット・コンテンツ検証',
      dir: 'unit',
      detail: 'unit/coverage/index.html',
    },
    { layer: 'L2', name: 'コード例の実行', dir: 'snippets' },
    { layer: 'L2', name: 'コンテナの起動', dir: 'container' },
    { layer: 'L2', name: '実行環境の手順', dir: 'runtime', multiEnv: true },
    { layer: 'L2', name: '実行環境の設定', dir: 'runtime-config' },
    { layer: 'L2', name: 'Maven / Gradle', dir: 'build-tools' },
    { layer: 'L2', name: 'Spring Boot の起動エラー', dir: 'spring-errors' },
    { layer: 'L3', name: 'Webview 画面', dir: 'webview', detail: 'webview/html-report/index.html' },
    { layer: 'L4', name: 'VS Code 統合', dir: 'integration', multiEnv: true },
    { layer: 'L5', name: 'パッケージ検証', dir: 'package' },
    { layer: 'L6', name: '実機 E2E', dir: 'e2e', detail: 'e2e/html-report/index.html' },
  ];

function readLayer(dir: string, env: string): Pick<LayerResult, 'totals' | 'failures'> {
  const file = join(ROOT, dir, 'junit.xml');
  if (!existsSync(file)) return { failures: [] };
  const xml = readFileSync(file, 'utf8');
  return {
    totals: readJUnitTotals(xml),
    failures: readJUnitFailures(xml).map((f) => `${env ? `[${env}] ` : ''}${f}`),
  };
}

function collectResults(): LayerResult[] {
  const results: LayerResult[] = [];
  for (const { layer, name, dir, detail, multiEnv } of LAYERS) {
    if (multiEnv) {
      const base = join(ROOT, dir);
      const envs = existsSync(base)
        ? readdirSync(base)
            .filter((e) => statSync(join(base, e)).isDirectory())
            .sort()
        : [];
      if (envs.length === 0) results.push({ layer, name, env: '—', failures: [] });
      for (const env of envs) results.push({ layer, name, env, ...readLayer(join(dir, env), env) });
    } else {
      const exists = detail && existsSync(join(ROOT, detail));
      results.push({
        layer,
        name,
        env: '—',
        detail: exists ? detail : undefined,
        ...readLayer(dir, ''),
      });
    }
  }
  return results;
}

function status(r: LayerResult): string {
  if (!r.totals) return '⚪ 未実行';
  if (r.totals.failures > 0) return '❌ 失敗';
  if (r.totals.tests === 0) return '⚠️ 0 件';
  return '✅ 成功';
}

function readCoverage(): string | undefined {
  const file = join(ROOT, 'unit', 'coverage', 'coverage-summary.json');
  if (!existsSync(file)) return undefined;
  const { total } = JSON.parse(readFileSync(file, 'utf8')) as {
    total: Record<'lines' | 'branches' | 'functions', { pct: number }>;
  };
  return `行 ${total.lines.pct}% / 分岐 ${total.branches.pct}% / 関数 ${total.functions.pct}%`;
}

function findImages(dir: string): string[] {
  const base = join(ROOT, dir);
  if (!existsSync(base)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.png')) out.push(relative(ROOT, p).replace(/\\/g, '/'));
    }
  };
  walk(base);
  return out.sort();
}

function buildMeta(): string {
  const parts = [new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'];
  if (process.env.GITHUB_SHA) parts.push(`commit ${process.env.GITHUB_SHA.slice(0, 7)}`);
  if (process.env.GITHUB_REF_NAME) parts.push(process.env.GITHUB_REF_NAME);
  return parts.join(' / ');
}

function buildMarkdown(results: LayerResult[], coverage: string | undefined): string {
  const anyFailed = results.some((r) => (r.totals?.failures ?? 0) > 0);
  const lines = [
    `### テスト結果 ${anyFailed ? '❌ 失敗あり' : '✅'}`,
    '',
    `<sub>${buildMeta()}</sub>`,
    '',
    '| 層 | 内容 | 環境 | 結果 | 成功 | 失敗 | スキップ |',
    '|---|---|---|---|---:|---:|---:|',
    ...results.map((r) => {
      const t = r.totals;
      const passed = t ? t.tests - t.failures - t.skipped : '—';
      return `| ${r.layer} | ${r.name} | ${r.env} | ${status(r)} | ${passed} | ${t?.failures ?? '—'} | ${t?.skipped ?? '—'} |`;
    }),
  ];
  if (coverage) lines.push('', `カバレッジ（L1）: ${coverage}`);
  const shots = findImages('webview/screenshots').length + findImages('e2e/screenshots').length;
  lines.push('', `スクリーンショット: ${shots} 枚（index.html で一覧表示）`);
  const failures = results.flatMap((r) => r.failures.map((f) => `- ${r.layer}: ${f}`));
  if (failures.length > 0) lines.push('', '#### 失敗したテスト', '', ...failures.slice(0, 30));
  if (failures.length > 30) lines.push(`- ほか ${failures.length - 30} 件`);
  return lines.join('\n') + '\n';
}

const esc = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function gallery(title: string, images: string[], groupBy: (path: string) => string): string {
  if (images.length === 0) return '';
  const groups = new Map<string, string[]>();
  for (const img of images) {
    const key = groupBy(img);
    groups.set(key, [...(groups.get(key) ?? []), img]);
  }
  const sections = [...groups.entries()]
    .map(
      ([group, imgs]) =>
        `<h3>${esc(group)}</h3><div class="grid">${imgs
          .map((img) => {
            const label = img
              .split('/')
              .pop()!
              .replace(/\.png$/, '');
            return `<figure><a href="${esc(img)}"><img src="${esc(img)}" alt="${esc(label)}" loading="lazy"></a><figcaption>${esc(label)}</figcaption></figure>`;
          })
          .join('')}</div>`,
    )
    .join('');
  return `<section><h2>${esc(title)}</h2>${sections}</section>`;
}

function buildHtml(results: LayerResult[], coverage: string | undefined): string {
  const rows = results
    .map((r) => {
      const t = r.totals;
      const passed = t ? t.tests - t.failures - t.skipped : '—';
      const detail = r.detail ? `<a href="${esc(r.detail)}">詳細</a>` : '';
      return `<tr class="${t && t.failures > 0 ? 'ng' : ''}"><td>${r.layer}</td><td>${esc(r.name)}</td><td>${esc(r.env)}</td><td>${status(r)}</td><td>${passed}</td><td>${t?.failures ?? '—'}</td><td>${t?.skipped ?? '—'}</td><td>${detail}</td></tr>`;
    })
    .join('');
  const failures = results.flatMap((r) => r.failures.map((f) => `<li>${r.layer}: ${esc(f)}</li>`));
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>テストレポート — Hatake ごった煮ツールボックス</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 24px 32px; color: #222; }
  table { border-collapse: collapse; margin: 12px 0; }
  th, td { border: 1px solid #ccc; padding: 4px 10px; text-align: left; }
  tr.ng { background: #fde8e8; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
  figure { margin: 0; border: 1px solid #ddd; padding: 6px; }
  figure img { width: 100%; display: block; }
  figcaption { font-size: 12px; color: #555; margin-top: 4px; }
  .meta { color: #666; font-size: 13px; }
</style>
</head>
<body>
<h1>テストレポート</h1>
<p class="meta">${esc(buildMeta())}</p>
<table><thead><tr><th>層</th><th>内容</th><th>環境</th><th>結果</th><th>成功</th><th>失敗</th><th>スキップ</th><th></th></tr></thead><tbody>${rows}</tbody></table>
${coverage ? `<p>カバレッジ（L1）: ${esc(coverage)}</p>` : ''}
${failures.length ? `<h2>失敗したテスト</h2><ul>${failures.join('')}</ul>` : ''}
${gallery('L6 実機 E2E（VS Code 上の操作手順）', findImages('e2e/screenshots'), () => '操作ステップ')}
${gallery('L3 Webview 画面（機能 × テーマ）', findImages('webview/screenshots'), (p) => p.split('/')[2] ?? '')}
</body>
</html>
`;
}

const results = collectResults();
const coverage = readCoverage();
writeFileSync(join(ROOT, 'summary.md'), buildMarkdown(results, coverage));
writeFileSync(join(ROOT, 'index.html'), buildHtml(results, coverage));
console.log(readFileSync(join(ROOT, 'summary.md'), 'utf8'));
console.log(`レポートを出力しました: ${join(ROOT, 'index.html')}`);

// JUnit XML の簡易な書き出し・読み込み（テストレポート集計用）
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface JUnitCase {
  name: string;
  /** 失敗時のメッセージ。undefined なら成功 */
  failure?: string;
}

export interface JUnitTotals {
  tests: number;
  failures: number;
  skipped: number;
}

const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function writeJUnit(
  path: string,
  suite: string,
  cases: JUnitCase[],
  skippedNames: string[] = [],
): void {
  const failures = cases.filter((c) => c.failure).length;
  const total = cases.length + skippedNames.length;
  const body = [
    ...cases.map((c) =>
      c.failure
        ? `    <testcase name="${escapeXml(c.name)}"><failure message="${escapeXml(c.failure)}"/></testcase>`
        : `    <testcase name="${escapeXml(c.name)}"/>`,
    ),
    ...skippedNames.map((name) => `    <testcase name="${escapeXml(name)}"><skipped/></testcase>`),
  ].join('\n');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="${total}" failures="${failures}" skipped="${skippedNames.length}">
  <testsuite name="${escapeXml(suite)}" tests="${total}" failures="${failures}" skipped="${skippedNames.length}">
${body}
  </testsuite>
</testsuites>
`,
  );
}

/** JUnit XML の <testsuite> の件数を合計する（ツールごとの差異を吸収するため testsuite 単位で数える） */
export function readJUnitTotals(xml: string): JUnitTotals {
  const totals: JUnitTotals = { tests: 0, failures: 0, skipped: 0 };
  for (const match of xml.matchAll(/<testsuite\b([^>]*)>/g)) {
    const attrs = match[1] ?? '';
    const num = (name: string) => Number(attrs.match(new RegExp(`\\b${name}="(\\d+)"`))?.[1] ?? 0);
    totals.tests += num('tests');
    totals.failures += num('failures') + num('errors');
    totals.skipped += num('skipped');
  }
  return totals;
}

/** 失敗したテストケース名を取り出す */
export function readJUnitFailures(xml: string): string[] {
  const names: string[] = [];
  // <testcase ...> から次の <testcase の手前までを 1 件として扱う（自己終了タグにも対応）
  for (const chunk of xml.split(/(?=<testcase\b)/).slice(1)) {
    const open = chunk.match(/^<testcase\b[^>]*?\bname="([^"]*)"[^>]*?(\/?)>/);
    if (!open || open[2] === '/') continue;
    const body = chunk.slice(open[0].length).split('</testcase>')[0] ?? '';
    if (!/<(failure|error)\b/.test(body)) continue;
    names.push(
      (open[1] ?? '')
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&'),
    );
  }
  return names;
}

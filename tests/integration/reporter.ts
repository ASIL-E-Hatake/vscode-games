// L4 用の Mocha レポーター: コンソールに結果を表示しつつ JUnit XML を書き出す。
// @vscode/test-cli 同梱の Mocha のバージョンに依存しないよう、runner のイベントだけを使う。
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

interface MochaTest {
  title: string;
  duration?: number;
  fullTitle(): string;
}

interface MochaRunner {
  on(event: 'pass' | 'pending', listener: (test: MochaTest) => void): void;
  on(event: 'fail', listener: (test: MochaTest, err: Error) => void): void;
  on(event: 'end', listener: () => void): void;
}

interface ReporterOptions {
  reporterOptions?: { junitFile?: string; suiteName?: string };
}

interface Result {
  name: string;
  durationMs: number;
  status: 'passed' | 'failed' | 'skipped';
  message?: string;
}

const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

class JUnitSpecReporter {
  constructor(runner: MochaRunner, options: ReporterOptions = {}) {
    const results: Result[] = [];
    const { junitFile, suiteName = 'L4 統合テスト' } = options.reporterOptions ?? {};

    runner.on('pass', (test) => {
      results.push({ name: test.fullTitle(), durationMs: test.duration ?? 0, status: 'passed' });
      console.log(`  ✔ ${test.fullTitle()} (${test.duration ?? 0}ms)`);
    });
    runner.on('fail', (test, err) => {
      results.push({
        name: test.fullTitle(),
        durationMs: test.duration ?? 0,
        status: 'failed',
        message: err.stack ?? err.message,
      });
      console.log(`  ✘ ${test.fullTitle()}\n${err.stack ?? err.message}`);
    });
    runner.on('pending', (test) => {
      results.push({ name: test.fullTitle(), durationMs: 0, status: 'skipped' });
      console.log(`  - ${test.fullTitle()}（スキップ）`);
    });
    runner.on('end', () => {
      const failures = results.filter((r) => r.status === 'failed').length;
      const skipped = results.filter((r) => r.status === 'skipped').length;
      console.log(
        `\n${results.length - failures - skipped} 件成功 / ${failures} 件失敗 / ${skipped} 件スキップ`,
      );
      if (!junitFile) return;
      const cases = results
        .map((r) => {
          const attrs = `name="${escapeXml(r.name)}" time="${(r.durationMs / 1000).toFixed(3)}"`;
          if (r.status === 'failed') {
            const message = escapeXml(r.message ?? '');
            return `    <testcase ${attrs}><failure message="${message.split('\n')[0]}">${message}</failure></testcase>`;
          }
          if (r.status === 'skipped') return `    <testcase ${attrs}><skipped/></testcase>`;
          return `    <testcase ${attrs}/>`;
        })
        .join('\n');
      mkdirSync(dirname(junitFile), { recursive: true });
      writeFileSync(
        junitFile,
        `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="${results.length}" failures="${failures}" skipped="${skipped}">
  <testsuite name="${escapeXml(suiteName)}" tests="${results.length}" failures="${failures}" skipped="${skipped}">
${cases}
  </testsuite>
</testsuites>
`,
      );
    });
  }
}

export = JUnitSpecReporter;

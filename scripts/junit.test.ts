import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readJUnitFailures, readJUnitTotals, writeJUnit } from './junit';

describe('JUnit XML', () => {
  it('書き出した結果を読み込める（往復）', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'junit-')), 'r.xml');
    writeJUnit(path, 'suite', [{ name: 'ok' }, { name: '失敗 <a&b>', failure: 'message "x"' }]);
    const xml = readFileSync(path, 'utf8');
    expect(readJUnitTotals(xml)).toEqual({ tests: 2, failures: 1, skipped: 0 });
    expect(readJUnitFailures(xml)).toEqual(['失敗 <a&b>']);
  });

  it('複数の testsuite と errors / skipped を合計する', () => {
    const xml = `<testsuites>
      <testsuite name="a" tests="3" failures="1" errors="1" skipped="1">
        <testcase name="t1"><failure/></testcase>
        <testcase name="t2"></testcase>
        <testcase name="t3"><error message="boom"/></testcase>
      </testsuite>
      <testsuite name="b" tests="2" failures="0">
        <testcase name="t4"/>
        <testcase name="t5"/>
      </testsuite>
    </testsuites>`;
    expect(readJUnitTotals(xml)).toEqual({ tests: 5, failures: 2, skipped: 1 });
    expect(readJUnitFailures(xml)).toEqual(['t1', 't3']);
  });
});

// L2 問題パックの検証: スキーマ（content/schemas/content-pack.schema.json）と、拡張機能が実行時に使う検証
// （src/core/contentPack.ts・contentPackValidate.ts）が食い違っていないか。テスト用のパックは tests/fixtures/content-pack/
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CODE_QUIZ_LANGUAGES } from '../src/core/codeQuiz';
import { PACK_GAMES, parsePack } from '../src/core/contentPack';
import { PACK_TYPING_LANGUAGES } from '../src/core/contentPackValidate';
import { TYPING_MODES } from '../src/features/game-typing/modes';
import { createValidator, loadContentFile } from './content';

const validate = createValidator(join('content', 'schemas', 'content-pack.schema.json'));
const FIXTURES = join('tests', 'fixtures', 'content-pack');
const fixture = (name: string) => loadContentFile(join(FIXTURES, name)) as Record<string, unknown>;
const schemaOk = (data: unknown) => validate(data) === true;

/** パックを 1 問（1 お題）ずつのパックに分ける */
function rowsOf(pack: Record<string, unknown>): { label: string; data: unknown }[] {
  const rows: { label: string; data: unknown }[] = [];
  for (const game of ['outputQuiz', 'bugHunt'] as const) {
    ((pack[game] as unknown[] | undefined) ?? []).forEach((row, i) =>
      rows.push({ label: `${game} ${i + 1}`, data: { [game]: [row] } }),
    );
  }
  for (const [lang, list] of Object.entries((pack.typing as Record<string, unknown[]>) ?? {})) {
    list.forEach((row, i) =>
      rows.push({ label: `typing.${lang} ${i + 1}`, data: { typing: { [lang]: [row] } } }),
    );
  }
  return rows;
}

describe('問題パックのスキーマ', () => {
  it('正しいパック（テスト用・ワークスペースのテスト用）はスキーマに合う', () => {
    for (const path of [
      join(FIXTURES, 'valid.yaml'),
      join(FIXTURES, 'shared.json'),
      join('tests', 'fixtures', 'workspace', '.vscode', 'hatake-gottani.pack.yaml'),
    ]) {
      const data = loadContentFile(path);
      expect(schemaOk(data), `${path}: ${JSON.stringify(validate.errors)}`).toBe(true);
      expect(parsePack(data, 'x').invalid).toEqual([]);
    }
  });

  it('不正な行を含むパックはスキーマに合わない', () => {
    expect(schemaOk(fixture('with-invalid.yaml'))).toBe(false);
  });

  it('1 問ずつ見ても、スキーマと実行時の検証の判定が食い違わない', () => {
    // 実行時だけで確かめる条件（スキーマでは書けないもの）で読み飛ばす行
    const runtimeOnly = ['bugHunt 2'];
    const mismatches: string[] = [];
    for (const name of readdirSync(FIXTURES)) {
      for (const row of rowsOf(fixture(name))) {
        const runtimeOk = parsePack(row.data, 'x').invalid.length === 0;
        const expected = name === 'with-invalid.yaml' && runtimeOnly.includes(row.label);
        if (schemaOk(row.data) !== runtimeOk && !expected) {
          mismatches.push(
            `${name} ${row.label}: スキーマ ${schemaOk(row.data)} / 実行時 ${runtimeOk}`,
          );
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('スキーマの言語・項目が、コードの定義と一致している', () => {
    const schema = validate.schema as {
      properties: Record<string, { properties?: Record<string, unknown> }>;
      definitions: { language: { enum: string[] } };
    };
    expect(schema.definitions.language.enum).toEqual([...CODE_QUIZ_LANGUAGES]);
    expect(Object.keys(schema.properties.typing?.properties ?? {})).toEqual([
      ...PACK_TYPING_LANGUAGES,
    ]);
    expect(Object.keys(schema.properties)).toEqual(
      expect.arrayContaining([...PACK_GAMES, 'name', 'version']),
    );
    // タイピングのお題の言語は、コードタイピングの言語と同じ
    expect([...PACK_TYPING_LANGUAGES]).toEqual(TYPING_MODES.map((m) => m.id));
  });
});

// L2（実行環境の設定）の検査で使う、設定ファイルの組み立て（src/features/runtime-guide/generators）の呼び出し。
// scripts/runtime-config-e2e.ts から使う。直接実行すると、既定の入力での全ファイルを表示する（確認用）:
//   npx tsx scripts/runtime-configs.ts
import { fileText, type OutputFile } from '../src/core/fileOutput';
import { GENERATORS } from '../src/features/runtime-guide/generators';
import {
  DEFAULT_GUIDE_INPUT,
  GENERATOR_IDS,
  type GeneratorId,
  type GuideInput,
} from '../src/features/runtime-guide/types';

/** 組み立てて、ファイルの一覧を返す（入力が不正なら例外） */
export function generate(id: GeneratorId, patch: Partial<GuideInput> = {}): OutputFile[] {
  const result = GENERATORS[id]({ ...DEFAULT_GUIDE_INPUT, ...patch });
  if (!Array.isArray(result)) {
    throw new Error(`${id} を組み立てられません: ${result.errors.join(' / ')}`);
  }
  return result;
}

/** 組み立てた最初のファイル（またはファイル名の末尾が一致するもの）の中身 */
export function generateText(
  id: GeneratorId,
  patch: Partial<GuideInput> = {},
  nameEndsWith?: string,
): string {
  const files = generate(id, patch);
  const file = nameEndsWith ? files.find((f) => f.name.endsWith(nameEndsWith)) : files[0];
  if (!file) throw new Error(`${id} に ${nameEndsWith ?? ''} のファイルがありません`);
  return fileText(file);
}

if (process.argv[1]?.endsWith('runtime-configs.ts')) {
  for (const id of GENERATOR_IDS) {
    for (const file of generate(id)) {
      console.log(`==== ${id} / ${file.name}（${file.language}）\n${fileText(file)}`);
      for (const w of file.warnings ?? []) console.log(`  ⚠ ${w}`);
      console.log('');
    }
  }
}

// 利用者が用意するデータファイル（JSON / YAML）の読み書き。リンク集・問題パックで共通。
// VS Code API に依存しない（dataFile.test.ts）
import { dump, load } from 'js-yaml';

export type DataFileFormat = 'json' | 'yaml';

/** 拡張子から形式を決める（.json 以外は YAML として扱う） */
export function formatFromPath(path: string): DataFileFormat {
  return /\.json$/i.test(path) ? 'json' : 'yaml';
}

/**
 * ファイルの内容を解析する。構文エラーのときは 1 行目だけの分かりやすいメッセージで例外を投げる
 */
export function parseDataText(text: string, format: DataFileFormat): unknown {
  try {
    return format === 'json' ? JSON.parse(text) : load(text);
  } catch (e) {
    throw new Error(`ファイルを読み込めません: ${(e as Error).message.split('\n')[0]}`, {
      cause: e,
    });
  }
}

/** データをファイルの内容（JSON / YAML）にする */
export function serializeData(body: unknown, format: DataFileFormat): string {
  return format === 'json' ? `${JSON.stringify(body, null, 2)}\n` : dump(body, { lineWidth: -1 });
}

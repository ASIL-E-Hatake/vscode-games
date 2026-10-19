// 問題パック: 自分やチームで作った問題（出力当てクイズ・バグ探し・タイピングのお題）を JSON / YAML で追加する。
// 1 ファイル = 1 パック。形式は docs/06-content-pack.md、スキーマは content/schemas/content-pack.schema.json。
// ここはパックの解析・問題 ID の付け替え・有効なパックの問題の集約（DOM・VS Code API に依存しない）。
// ゲームの Webview からも定数・型を import する。出どころ（個人・共有ファイル・ワークスペース）の読み込みは
// src/features/content-pack/service.ts
import type { BugQuestion, OutputQuestion } from './codeQuiz';
import {
  checkPackBugQuestion,
  checkPackOutputQuestion,
  checkPackSnippet,
  PACK_LIMITS,
  PACK_TYPING_LANGUAGES,
  type Checked,
  type PackTypingLanguage,
} from './contentPackValidate';

/**
 * 問題パックの問題だけを出すモードの ID（各ゲームの runGame の modes・score.modes に入れる予約 ID）。
 * game-kit はこのモードを、パックの問題があるときだけ表示し、難易度を選ばせず、記録（自己ベスト・ゴースト）を
 * このモード ID で同梱の問題とは別に残す
 */
export const CONTENT_PACK_MODE = 'pack';

/** ゲームのルール説明で選ぶモード（runGame の modes に足す） */
export const CONTENT_PACK_PLAY_MODE = { id: CONTENT_PACK_MODE, label: '問題パック' };

/** score.modes に足す記録のモード（同梱の問題の記録とは別） */
export const CONTENT_PACK_SCORE_MODE = {
  id: CONTENT_PACK_MODE,
  label: '問題パック',
  group: CONTENT_PACK_MODE,
};

/** パックの問題を使うゲーム（パックのファイルの項目名） */
export const PACK_GAMES = ['outputQuiz', 'bugHunt', 'typing'] as const;
export type PackGame = (typeof PACK_GAMES)[number];

export const PACK_GAME_LABELS: Record<PackGame, string> = {
  outputQuiz: '出力当て',
  bugHunt: 'バグ探し',
  typing: 'タイピング',
};

/** ゲームのルール説明に出すパックの情報（GameInitData.contentPack） */
export interface ContentPackInfo {
  /** そのゲームの問題を含む有効なパックの数 */
  packs: number;
  /** 問題（お題）の数 */
  questions: number;
}

/** 解析・検証済みの 1 パック（問題 ID はパックの中の ID のまま） */
export interface ContentPack {
  name: string;
  description?: string;
  outputQuiz: OutputQuestion[];
  bugHunt: BugQuestion[];
  typing: Partial<Record<PackTypingLanguage, string[]>>;
}

/** 読み込めなかった問題（どこの・なぜ） */
export interface PackInvalidRow {
  /** 例: 「出力当て 2 問目」「タイピング（java）3 件目」 */
  where: string;
  errors: string[];
}

export interface ParsedPack {
  pack: ContentPack;
  invalid: PackInvalidRow[];
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const TOP_KEYS = ['version', 'name', 'description', ...PACK_GAMES];

/** 配列の各行を検証し、正しい行だけを返す（id の重複・上限も確かめる） */
function checkRows<T>(
  rows: unknown,
  label: string,
  limit: number,
  check: (v: unknown) => Checked<T>,
  keyOf: (v: T) => string,
  invalid: PackInvalidRow[],
): T[] {
  if (rows === undefined) return [];
  if (!Array.isArray(rows)) {
    invalid.push({ where: label, errors: ['配列（- で始まる行の並び）にしてください'] });
    return [];
  }
  const result: T[] = [];
  const seen = new Set<string>();
  rows.forEach((row, i) => {
    const where = `${label} ${i + 1} ${label.startsWith('タイピング') ? '件目' : '問目'}`;
    if (i >= limit) {
      invalid.push({ where, errors: [`上限（${limit}）を超えています`] });
      return;
    }
    const checked = check(row);
    if ('errors' in checked) {
      invalid.push({ where, errors: checked.errors });
      return;
    }
    const key = keyOf(checked.value);
    if (seen.has(key)) {
      invalid.push({ where, errors: [`同じものがパックの中にあります: ${key}`] });
      return;
    }
    seen.add(key);
    result.push(checked.value);
  });
  return result;
}

/**
 * パックのファイルの内容（JSON / YAML を解析した値）を検証する。
 * 不正な問題は読み飛ばして invalid に記録する（パック全体は拒否しない）。
 * パックとして読めない（オブジェクトでない・問題が 1 つも書かれていない・version が違う）ときは例外を投げる。
 * @param fallbackName name が無いときのパックの名前（ファイル名など）
 */
export function parsePack(data: unknown, fallbackName: string): ParsedPack {
  if (!isObject(data)) {
    throw new Error('問題パックは「name」「outputQuiz」などの項目を持つ形式にしてください');
  }
  if (data.version !== undefined && data.version !== 1) {
    throw new Error('version は 1 にしてください（省略もできます）');
  }
  if (!PACK_GAMES.some((key) => data[key] !== undefined)) {
    throw new Error('outputQuiz・bugHunt・typing のどれかに問題を書いてください');
  }
  const invalid: PackInvalidRow[] = [];
  const unknown = Object.keys(data).filter((k) => !TOP_KEYS.includes(k));
  if (unknown.length > 0) {
    invalid.push({ where: 'パック', errors: [`不明な項目があります: ${unknown.join(', ')}`] });
  }
  const text = (key: 'name' | 'description', max: number): string | undefined => {
    const v = data[key];
    if (v === undefined) return undefined;
    if (typeof v !== 'string' || !v.trim() || v.trim().length > max) {
      invalid.push({
        where: 'パック',
        errors: [`${key} は ${max} 文字以内の文字列にしてください`],
      });
      return undefined;
    }
    return v.trim();
  };
  const name = text('name', PACK_LIMITS.name) ?? fallbackName;
  const description = text('description', PACK_LIMITS.description);

  const outputQuiz = checkRows(
    data.outputQuiz,
    PACK_GAME_LABELS.outputQuiz,
    PACK_LIMITS.questions,
    checkPackOutputQuestion,
    (q) => q.id,
    invalid,
  );
  const bugHunt = checkRows(
    data.bugHunt,
    PACK_GAME_LABELS.bugHunt,
    PACK_LIMITS.questions,
    checkPackBugQuestion,
    (q) => q.id,
    invalid,
  );
  const typing: ContentPack['typing'] = {};
  if (data.typing !== undefined) {
    if (!isObject(data.typing)) {
      invalid.push({
        where: PACK_GAME_LABELS.typing,
        errors: [`言語（${PACK_TYPING_LANGUAGES.join(' / ')}）ごとにお題の配列を書いてください`],
      });
    } else {
      for (const [lang, rows] of Object.entries(data.typing)) {
        const label = `${PACK_GAME_LABELS.typing}（${lang}）`;
        if (!(PACK_TYPING_LANGUAGES as readonly string[]).includes(lang)) {
          invalid.push({
            where: label,
            errors: [`言語は ${PACK_TYPING_LANGUAGES.join(' / ')} のどれかにしてください`],
          });
          continue;
        }
        const snippets = checkRows(
          rows,
          label,
          PACK_LIMITS.snippets,
          checkPackSnippet,
          (s) => s,
          invalid,
        );
        if (snippets.length > 0) typing[lang as PackTypingLanguage] = snippets;
      }
    }
  }
  return {
    pack: { name, ...(description ? { description } : {}), outputQuiz, bugHunt, typing },
    invalid,
  };
}

/** パックの問題数（種類ごと） */
export function packCounts(pack: ContentPack): Record<PackGame, number> {
  return {
    outputQuiz: pack.outputQuiz.length,
    bugHunt: pack.bugHunt.length,
    typing: Object.values(pack.typing).reduce((n, list) => n + (list?.length ?? 0), 0),
  };
}

/** 画面に出す問題 ID（同梱の問題・ほかのパックと重ならないよう、パックの名前を前に付ける） */
export function packQuestionId(packName: string, id: string): string {
  return `${CONTENT_PACK_MODE}:${packName}:${id}`;
}

/** パックをファイルに書き出す形にする（エクスポート用。問題 ID はパックの中の ID のまま） */
export function packToFile(pack: ContentPack): Record<string, unknown> {
  const typing = Object.fromEntries(
    Object.entries(pack.typing).filter(([, list]) => list && list.length > 0),
  );
  return {
    version: 1,
    name: pack.name,
    ...(pack.description ? { description: pack.description } : {}),
    ...(pack.outputQuiz.length > 0 ? { outputQuiz: pack.outputQuiz } : {}),
    ...(pack.bugHunt.length > 0 ? { bugHunt: pack.bugHunt } : {}),
    ...(Object.keys(typing).length > 0 ? { typing } : {}),
  };
}

/** 集約するパック（出どころの順に並べる） */
export interface PackEntry {
  /** 出どころと場所から作る一意なキー（例: personal:<id>、shared:<パス>） */
  key: string;
  pack: ContentPack;
  enabled: boolean;
}

/** 有効なパックの問題をまとめたもの（ゲームの initData に渡す） */
export interface PackQuestionSet {
  outputQuiz: OutputQuestion[];
  bugHunt: BugQuestion[];
  /** 全言語のお題（重複は除く） */
  typing: string[];
  info: Record<PackGame, ContentPackInfo>;
  /** ほかのパックと問題 ID が同じため読み飛ばした問題 */
  duplicates: string[];
}

/**
 * 有効なパックの問題をまとめる。問題 ID には packQuestionId を付ける。
 * 同じ名前のパックが複数あって ID が重なった問題は、先に並んだパックを優先し、後のものは読み飛ばす
 */
export function mergePacks(entries: readonly PackEntry[]): PackQuestionSet {
  const set: PackQuestionSet = {
    outputQuiz: [],
    bugHunt: [],
    typing: [],
    info: {
      outputQuiz: { packs: 0, questions: 0 },
      bugHunt: { packs: 0, questions: 0 },
      typing: { packs: 0, questions: 0 },
    },
    duplicates: [],
  };
  const ids = new Set<string>();
  const snippets = new Set<string>();
  const withId = <Q extends { id: string }>(pack: ContentPack, game: PackGame, list: Q[]): Q[] =>
    list.flatMap((q) => {
      const id = packQuestionId(pack.name, q.id);
      if (ids.has(id)) {
        set.duplicates.push(`${pack.name} の${PACK_GAME_LABELS[game]}「${q.id}」`);
        return [];
      }
      ids.add(id);
      return [{ ...q, id }];
    });
  for (const { pack, enabled } of entries) {
    if (!enabled) continue;
    const before = PACK_GAMES.map((game) => set[game].length);
    set.outputQuiz.push(...withId(pack, 'outputQuiz', pack.outputQuiz));
    set.bugHunt.push(...withId(pack, 'bugHunt', pack.bugHunt));
    for (const s of Object.values(pack.typing).flatMap((list) => list ?? [])) {
      if (snippets.has(s)) continue;
      snippets.add(s);
      set.typing.push(s);
    }
    PACK_GAMES.forEach((game, i) => {
      const added = set[game].length - before[i]!;
      if (added === 0) return;
      set.info[game].packs += 1;
      set.info[game].questions += added;
    });
  }
  return set;
}

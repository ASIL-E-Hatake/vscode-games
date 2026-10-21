// チートシートの絞り込み・比較。ホストと Webview の両方で使う（VS Code API・DOM に依存しない）
import { matchesQuery } from '../../core/textSearch';
import { LANGUAGE_TOPICS } from './topics';
import type { CheatItem, CheatSheet, CheatTopic } from './types';

/** 表示順（order → 名前）に並べる */
export function sortSheets(sheets: readonly CheatSheet[]): CheatSheet[] {
  return [...sheets].sort(
    (a, b) => (a.order ?? 100) - (b.order ?? 100) || a.name.localeCompare(b.name),
  );
}

/**
 * 設定（hatake-gottani.cheatsheet.languages）で表示するチートシートを絞り込む。
 * 存在しない ID は無視し、絞り込んだ結果が 0 件になる場合（空の設定を含む）はすべて表示する
 * （設定が原因で何も見えなくならないように）。
 */
export function selectSheets(sheets: readonly CheatSheet[], ids: readonly string[]): CheatSheet[] {
  const wanted = new Set(ids);
  const selected = sheets.filter((s) => wanted.has(s.id));
  return selected.length > 0 ? selected : [...sheets];
}

export function topicTitle(topic: CheatTopic): string {
  return topic.title ?? LANGUAGE_TOPICS.find((t) => t.id === topic.id)?.title ?? topic.id;
}

/** 検索語で項目を絞り込む（項目が無くなったトピックは除く） */
export function filterSheet(sheet: CheatSheet, query: string): CheatTopic[] {
  return sheet.topics
    .map((topic) => ({
      ...topic,
      items: topic.items.filter((item) =>
        matchesQuery([topicTitle(topic), item.title, item.code, item.note], query),
      ),
    }))
    .filter((topic) => topic.items.length > 0);
}

/** 選んでいる項目（タブ）が一覧に無いときは先頭の項目にする。項目が 1 つも無ければ空文字 */
export function resolveTopicId(topicIds: readonly string[], wanted: string): string {
  return topicIds.includes(wanted) ? wanted : (topicIds[0] ?? '');
}

/** 言語を横に並べて比べる: 指定したトピックの、各言語の項目 */
export function compareTopic(
  sheets: readonly CheatSheet[],
  topicId: string,
): { sheet: CheatSheet; items: CheatItem[] }[] {
  return sheets
    .filter((s) => s.kind === 'language')
    .map((sheet) => ({
      sheet,
      items: sheet.topics.find((t) => t.id === topicId)?.items ?? [],
    }));
}

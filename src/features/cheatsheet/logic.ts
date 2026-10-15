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

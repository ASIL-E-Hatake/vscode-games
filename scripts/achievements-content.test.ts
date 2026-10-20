// L2: 同梱の実績の定義（content/achievements）の検査。
// スキーマ・id の重複は scripts/content.ts のビルド検査で確認される。ここでは「条件のカウンターが、
// 実際に記録される出来事の名前か」（名前の打ち間違いで永遠に獲得できない実績を防ぐ）などを確かめる。
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { flattenAchievementFiles, type AchievementFile } from '../src/core/achievements';
import { COUNTERS } from '../src/core/counters';
import { strings } from '../src/features/achievements/strings';
import { TYPING_MODES } from '../src/features/game-typing/modes';

const dir = join('content', 'achievements');
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.yaml'))
  .map((f) => load(readFileSync(join(dir, f), 'utf8')) as AchievementFile);
const defs = flattenAchievementFiles(files);
const featureIds = readdirSync(join('src', 'features'), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);
const games = featureIds.filter((id) => id.startsWith('game-'));

/** 記録される出来事のうち、実績の条件に使えるもの（名前の約束: docs/08-keep-playing.md 2.1） */
const KNOWN = new Set<string>([
  COUNTERS.gamesPlays,
  COUNTERS.gamesBest,
  COUNTERS.glossaryPercent,
  COUNTERS.glossaryFound,
  COUNTERS.dailyDays,
  COUNTERS.dailyStreak,
  ...featureIds.map((id) => COUNTERS.opened(id)),
  ...games.flatMap((id) => [COUNTERS.plays(id), COUNTERS.best(id), COUNTERS.dailyOf(id)]),
  // ゲーム固有の出来事（Webview から bridge.recordEvent で送る。名前の先頭に機能 ID が付く）
  ...TYPING_MODES.map((m) => `game-typing.lines.${m.id}`),
  'game-reaction.perfect',
  'game-slide-puzzle.solved',
  'game-shortcut-quiz.perfect',
  'game-output-quiz.perfect',
  'game-bug-hunt.perfect',
  'game-output-quiz.secret',
  'game-bug-hunt.secret',
  // 最大コンボ（game-kit が自動で記録する。コンボを使うゲーム）
  'game-typing.combo',
  'game-shortcut-quiz.combo',
  'game-output-quiz.combo',
  'game-bug-hunt.combo',
]);

/** 「.*」でまとめる接頭辞（その接頭辞で始まる出来事が 1 つ以上ある） */
const prefixExists = (prefix: string) => [...KNOWN].some((name) => name.startsWith(prefix));

describe('同梱の実績の定義', () => {
  it('30〜40 件ある', () => {
    expect(defs.length).toBeGreaterThanOrEqual(30);
    expect(defs.length).toBeLessThanOrEqual(45);
  });

  it('条件のカウンターは、実際に記録される出来事の名前', () => {
    const unknown: string[] = [];
    for (const d of defs) {
      for (const c of [...(d.all ?? []), ...(d.any ?? [])]) {
        const ok = c.counter.endsWith('.*')
          ? prefixExists(c.counter.slice(0, -1))
          : KNOWN.has(c.counter);
        if (!ok) unknown.push(`${d.id}: ${c.counter}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it('分類には表示名がある', () => {
    const missing = defs.filter((d) => d.category && !(d.category in strings.categories));
    expect(missing.map((d) => d.id)).toEqual([]);
  });

  it('全員がどの分類にも入り、初級の実績（機能を開く・初めて遊ぶ）が多い', () => {
    expect(defs.every((d) => d.category)).toBe(true);
    const beginner = defs.filter((d) =>
      [...(d.all ?? []), ...(d.any ?? [])].every((c) => c.atLeast <= 1),
    );
    expect(beginner.length).toBeGreaterThanOrEqual(10);
  });

  it('未獲得でも見えるヒントがある（シークレット以外）', () => {
    const lacking = defs.filter((d) => !d.secret && !d.hint);
    expect(lacking.map((d) => d.id)).toEqual([]);
  });
});

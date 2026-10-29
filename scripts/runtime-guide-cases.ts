// 実行環境・サーバー構築ガイドの検査で使う組み合わせ（対象 × OS × 条件のチェックと選択肢）。
// L2 のデータ検査（runtime-guide.test.ts）とコマンドの構文検査（runtime-guide-snippets.ts）で共用する。
import { PARAM_DEFS } from '../src/features/runtime-guide/input';
import {
  DEFAULT_GUIDE_INPUT,
  type GuideInput,
  type GuideTopicData,
} from '../src/features/runtime-guide/types';

export interface GuideCase {
  name: string;
  topic: GuideTopicData;
  input: GuideInput;
}

/**
 * 対象ごとに、対応する OS × （既定 / チェックをすべて反転 / 選択肢を 1 つずつ）の入力を作る。
 * 版の選択肢（上げる先と戻す先）は既定のまま（同じ版になると入力の誤りになるため）
 */
export function guideCases(topics: readonly GuideTopicData[]): GuideCase[] {
  const cases: GuideCase[] = [];
  for (const topic of topics) {
    for (const os of topic.os) {
      const base: GuideInput = { ...DEFAULT_GUIDE_INPUT, os };
      cases.push({ name: `${topic.topic} / ${os}`, topic, input: base });
      const flags = topic.params.filter((p) => PARAM_DEFS[p].type === 'flag');
      if (flags.length > 0) {
        const flipped = { ...base } as unknown as Record<string, unknown>;
        for (const f of flags) flipped[f] = !base[f];
        cases.push({
          name: `${topic.topic} / ${os} / ${flags.map((f) => `${f}=${String(!base[f])}`).join(',')}`,
          topic,
          input: flipped as unknown as GuideInput,
        });
      }
      if (topic.params.includes('winNodeTool')) {
        for (const tool of PARAM_DEFS.winNodeTool.options ?? []) {
          if (tool === base.winNodeTool) continue;
          cases.push({
            name: `${topic.topic} / ${os} / winNodeTool=${tool}`,
            topic,
            input: { ...base, winNodeTool: tool as GuideInput['winNodeTool'] },
          });
        }
      }
    }
  }
  return cases;
}

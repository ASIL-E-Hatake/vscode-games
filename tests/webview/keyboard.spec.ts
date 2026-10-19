// キーボード操作の横断テスト（全画面 × 3 テーマ）
// Tab キーだけで画面内の操作対象を一巡し、次を確かめる。
// - フォーカスが見えない要素（大きさ 0・非表示）に移らない
// - フォーカス中の要素に、見える枠線（outline または box-shadow）がある
// - 一巡して最初の要素に戻れる（フォーカスが閉じ込められない）
import type { Page } from '@playwright/test';
import { expect, test, THEMES } from './harness';
import {
  bugHuntData,
  cheatsheetData,
  commandBuilderData,
  errorDictData,
  gitDictData,
  glossaryData,
  homeFullData,
  linksData,
  linuxDictData,
  outputQuizData,
  puzzleData,
  shortcutQuizData,
  typingData,
  vscodeGuideData,
} from './fixtures';

const SCREENS: { featureId: string; data: unknown }[] = [
  { featureId: 'home', data: homeFullData },
  { featureId: 'vscode-guide', data: vscodeGuideData },
  { featureId: 'linux-dict', data: linuxDictData },
  { featureId: 'cheatsheet', data: cheatsheetData },
  { featureId: 'error-dict', data: errorDictData },
  { featureId: 'git-dict', data: gitDictData },
  { featureId: 'glossary', data: glossaryData },
  { featureId: 'links', data: linksData },
  { featureId: 'command-builder', data: commandBuilderData },
  { featureId: 'dev-utils', data: undefined },
  { featureId: 'path-converter', data: { activeFilePath: 'C:\\work\\src\\main.ts' } },
  { featureId: 'game-typing', data: typingData },
  { featureId: 'game-reaction', data: { playCount: 0 } },
  { featureId: 'game-slide-puzzle', data: puzzleData },
  { featureId: 'game-shortcut-quiz', data: shortcutQuizData },
  { featureId: 'game-output-quiz', data: outputQuizData },
  { featureId: 'game-bug-hunt', data: bugHuntData },
  { featureId: 'cron-builder', data: undefined },
];

/** 一巡を打ち切る回数（これを超えたら閉じ込めとみなす） */
const MAX_TABS = 400;

interface FocusInfo {
  key: string;
  label: string;
  visible: boolean;
  indicator: boolean;
}

/** フォーカス中の要素の情報 */
function focused(page: Page): Promise<FocusInfo | undefined> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement) || el === document.body) return undefined;
    // 同じ要素かどうかを判定するための、DOM 上の位置
    const path: number[] = [];
    for (let n: Element | null = el; n?.parentElement; n = n.parentElement) {
      path.unshift([...n.parentElement.children].indexOf(n));
    }
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const transparent = (c: string) => c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c);
    const outline =
      style.outlineStyle !== 'none' &&
      parseFloat(style.outlineWidth) >= 1 &&
      !transparent(style.outlineColor);
    const shadow = style.boxShadow !== 'none';
    return {
      key: path.join('.'),
      label: (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 40),
      visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden',
      indicator: outline || shadow,
    };
  });
}

test.describe('キーボード操作（全画面）', () => {
  for (const { featureId, data } of SCREENS) {
    for (const theme of THEMES) {
      test(`${featureId}: Tab で一巡でき、フォーカス位置が見える（${theme}）`, async ({
        webview,
        page,
      }) => {
        await webview.open(featureId, { theme, data, random: 0 });
        const seen: FocusInfo[] = [];
        for (let i = 0; i < MAX_TABS; i++) {
          await page.keyboard.press('Tab');
          const info = await focused(page);
          if (!info) continue; // 末尾の次は一度 body（ブラウザの外）に出る
          if (seen[0]?.key === info.key) break;
          seen.push(info);
        }
        expect(seen.length, '操作できる要素が 1 つ以上ある').toBeGreaterThan(0);
        expect(seen.length, 'Tab で一巡して最初に戻れる').toBeLessThan(MAX_TABS);
        const problems = seen
          .filter((s) => !s.visible || !s.indicator)
          .map((s) => `${s.label}（${!s.visible ? '見えない要素' : '枠線なし'}）`);
        expect(problems).toEqual([]);
      });
    }
  }
});

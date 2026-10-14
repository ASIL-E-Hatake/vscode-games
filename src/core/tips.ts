// 今日のひとこと（Tips）。VS Code API に依存しない（ユニットテスト対象）

export interface Tip {
  id: string;
  category: 'vscode' | 'linux' | 'git' | 'programming';
  text: string;
  keys?: string;
}

export const TIP_CATEGORY_LABELS: Record<Tip['category'], string> = {
  vscode: 'VS Code',
  linux: 'Linux',
  git: 'Git',
  programming: 'プログラミング',
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** その日の Tip を返す。同じ日（ローカル日付）なら同じ Tip、翌日は次の Tip */
export function pickDailyTip(tips: readonly Tip[], date: Date): Tip | undefined {
  if (tips.length === 0) return undefined;
  const localDay = Math.floor((date.getTime() - date.getTimezoneOffset() * 60 * 1000) / MS_PER_DAY);
  return tips[((localDay % tips.length) + tips.length) % tips.length];
}

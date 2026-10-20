// リリースのときに一緒に直すドキュメント（ロードマップ・CLAUDE.md・試用ガイド）が、
// package.json の version に合っているかを調べる（L5 パッケージ検証から呼ぶ）。
//
// リリース PR（verX_Y_Z → main）のマージ = リリースなので、リリース準備の PR の時点で
// 「リリース済み」と書いておく。後から直すのを忘れないよう、ここで機械的に検査する。

export interface ReleaseDocs {
  version: string;
  roadmap: string;
  claudeMd: string;
  trialGuide: string;
}

export interface ReleaseDocsIssue {
  file: string;
  message: string;
}

/** プレリリース（1.0.0-beta.1 など）は検査しない */
export function isPrerelease(version: string): boolean {
  return version.includes('-');
}

/** 次のバージョンの統合ブランチ名（0.5.0 → ver0_6_0）。minor を 1 つ上げた版 */
export function nextIntegrationBranch(version: string): string {
  const [major, minor] = version.split('.').map(Number);
  return `ver${major}_${minor + 1}_0`;
}

export function checkReleaseDocs(docs: ReleaseDocs): ReleaseDocsIssue[] {
  const { version, roadmap, claudeMd, trialGuide } = docs;
  if (isPrerelease(version)) return [];
  const v = `v${version}`;
  const issues: ReleaseDocsIssue[] = [];
  const add = (file: string, message: string) => issues.push({ file, message });

  // ロードマップ
  if (!roadmap.includes(`| [${v}](`)) {
    add(
      'docs/roadmap.md',
      `「リリース済み」の表に ${v} の行がありません（| [${v}](…/releases/tag/${v}) | 日付 | 主な内容 |）`,
    );
  }
  const overview = roadmap.split('\n').find((l) => l.startsWith(`| ${v} `));
  if (!overview || !overview.startsWith(`| ${v} ✅ |`)) {
    add('docs/roadmap.md', `「全体の流れ」の ${v} に ✅ が付いていません`);
  }
  const heading = roadmap.split('\n').find((l) => l.startsWith(`## ${v} `));
  if (heading && !heading.includes('リリース済み')) {
    add('docs/roadmap.md', `見出し「${heading}」を「（リリース済み）」にしてください`);
  }
  for (const line of roadmap.split('\n')) {
    if (line.startsWith('## ') && line.includes('リリース準備中')) {
      add(
        'docs/roadmap.md',
        `見出し「${line}」に「リリース準備中」が残っています（リリース済みに直す）`,
      );
    }
  }

  // CLAUDE.md の「現状」
  const status = claudeMd.split('\n').find((l) => l.startsWith('> 現状:'));
  const next = nextIntegrationBranch(version);
  if (!status) {
    add('CLAUDE.md', '「> 現状:」の行がありません');
  } else if (!status.includes(`${v} リリース済み`) || !status.includes(next)) {
    add(
      'CLAUDE.md',
      `「現状」を「${v} リリース済み（社内試用中）。次は …（統合ブランチ \`${next}\`）。」にしてください（今: ${status}）`,
    );
  }

  // 試用ガイド
  const title = trialGuide.split('\n')[0] ?? '';
  if (!title.includes(`（${v}）`)) {
    add('docs/05-trial-guide.md', `タイトルを「（${v}）」にしてください（今: ${title}）`);
  }
  if (!trialGuide.includes(`hatake-gottani-${version}.vsix`)) {
    add(
      'docs/05-trial-guide.md',
      `インストールのコマンドを hatake-gottani-${version}.vsix にしてください`,
    );
  }
  return issues;
}

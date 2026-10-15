// フィードバック用 Issue の URL を作る（VS Code API に依存しない）
//
// GitHub の Issue フォームは、URL のクエリで文字入力の項目（とタイトル）に初期値を入れられる。
// 項目の ID（environment など）は .github/ISSUE_TEMPLATE/1-feedback.yml の id と一致させる。

/** フィードバック用の Issue テンプレートのファイル名 */
export const FEEDBACK_TEMPLATE = '1-feedback.yml';

/** テンプレートのタイトルの初期値（title と一致させる） */
export const FEEDBACK_TITLE_PREFIX = '[フィードバック] ';

export interface FeedbackEnvironment {
  extensionVersion: string;
  vscodeVersion: string;
  /** process.platform の値 */
  platform: string;
  /** 配色テーマ名（workbench.colorTheme） */
  theme?: string;
}

const PLATFORM_LABELS: Record<string, string> = {
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux',
};

export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform;
}

/**
 * package.json の repository.url（例: https://github.com/owner/repo.git）から
 * リポジトリのページの URL を作る。GitHub 以外・形式が違う場合は undefined
 */
export function repositoryPage(repositoryUrl: string | undefined): string | undefined {
  const match = repositoryUrl?.match(
    /^(?:git\+)?https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/,
  );
  return match ? `https://github.com/${match[1]}/${match[2]}` : undefined;
}

/**
 * フィードバック用 Issue の作成画面の URL。環境とバージョンを記入済みにする。
 * 機能名を渡すとタイトルに入れる（選択式の項目は URL で選択済みにできないため）
 */
export function feedbackUrl(
  repositoryPageUrl: string,
  env: FeedbackEnvironment,
  featureTitle?: string,
): string {
  const url = new URL(`${repositoryPageUrl}/issues/new`);
  url.searchParams.set('template', FEEDBACK_TEMPLATE);
  if (featureTitle) url.searchParams.set('title', `${FEEDBACK_TITLE_PREFIX}${featureTitle}: `);
  url.searchParams.set(
    'environment',
    [platformLabel(env.platform), `VS Code ${env.vscodeVersion}`, env.theme]
      .filter(Boolean)
      .join(' / '),
  );
  url.searchParams.set('version', env.extensionVersion);
  return url.toString();
}

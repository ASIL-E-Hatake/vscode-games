// 表示文字列（実行環境・サーバー構築ガイド）
import type { InputError } from './input';
import type { GuideOs, GuideShell, ParamId } from './types';
import type { SupportStatus } from './versions';

export const strings = {
  title: '実行環境・サーバー構築ガイド',
  description:
    'Java・Node・Tomcat・Nginx を安全な版に上げる手順と、サーバーを一から作る流れ。版・ポート・ドメインを入れるとコマンドと設定ファイルができる',
  lead: '対象と OS を選び、版やポートを入れると、番号付きの手順（コマンドと設定ファイル）ができます。拡張機能はコマンドを実行しません（コピーするだけ）。',
  caution:
    '本番のサーバーで実行する前に、必ず検証環境で同じ手順を試してください。停止を伴う手順・戻せない手順には印を付けています。',

  topicsLabel: '対象',
  osLabel: 'OS',
  oses: {
    rhel9: 'RHEL 9 系（Rocky・Alma）',
    al2023: 'Amazon Linux 2023',
    windows: 'Windows（開発 PC）',
  } satisfies Record<GuideOs, string>,
  inputLegend: '入力',
  noInput: 'この対象には入力はありません。',

  params: {
    javaVersion: 'Java の版（上げる先）',
    javaPrevVersion: 'Java の版（今・戻す先）',
    nodeVersion: 'Node の版（上げる先）',
    nodePrevVersion: 'Node の版（今・戻す先）',
    tomcatVersion: 'Tomcat の版（上げる先）',
    tomcatPrevVersion: 'Tomcat の版（今・戻す先）',
    appName: 'アプリ名（サービス名）',
    appUser: 'アプリを動かすユーザー',
    appPort: 'アプリのポート',
    installDir: 'アプリのインストール先',
    jarName: 'jar のファイル名',
    javaOpts: 'JVM のオプション',
    springProfile: 'Spring のプロファイル（空なら指定しない）',
    healthPath: 'ヘルスチェックのパス',
    tomcatRoot: 'Tomcat の本体を置くフォルダ',
    catalinaBase: 'CATALINA_BASE（設定・アプリ）',
    tomcatUser: 'Tomcat を動かすユーザー',
    domain: 'ドメイン',
    tls: 'HTTPS で公開する（TLS）',
    certPath: '証明書のパス',
    keyPath: '秘密鍵のパス',
    httpRedirect: 'HTTP を HTTPS へ転送する',
    maxBodySize: 'アップロードの上限（例: 10m）',
    winNodeTool: 'Node のバージョン管理ツール',
  } satisfies Record<ParamId, string>,
  paramOptions: {
    fnm: 'fnm（おすすめ）',
    volta: 'Volta',
    'nvm-windows': 'nvm-windows',
  } as Record<string, string>,

  inputErrorHeading: '入力を確かめてください',
  inputError: (label: string, error: InputError): string =>
    error.message ??
    (error.kind === 'same'
      ? `${label}: 上げる先と同じ版です`
      : `${label}: 選択肢から選んでください`),

  stepsHeading: (title: string) => `手順: ${title}`,
  stepNumber: (n: number) => `${n}.`,
  why: 'なぜ',
  danger: '危険',
  pitfalls: 'ハマりどころ',
  topicPitfalls: 'この対象のハマりどころ',
  links: '公式の情報',
  copy: 'コピー',
  copyLabel: (step: string) => `「${step}」のコマンドをコピー`,
  shells: { bash: 'bash', powershell: 'PowerShell' } satisfies Record<GuideShell, string>,
  commandsLabel: (step: string) => `「${step}」のコマンド`,
  goto: (title: string) => `「${title}」の手順を開く`,
  fileError: '設定ファイルを組み立てられませんでした',

  versionHeading: '今の版の判定',
  versionHint:
    'java -version・node -v・catalina.sh version（version.sh）・nginx -v の出力や、Spring Boot の起動ログをそのまま貼ると、サポートの状態と上げる先の版を表示します（判定はこの PC の中だけで行います）。',
  versionLabel: 'コマンドの出力を貼る',
  versionPlaceholder: '例: openjdk version "17.0.12" 2024-07-16',
  versionNone: '版を読み取れませんでした。コマンドの出力をそのまま貼ってください。',
  versionTableLabel: '版の判定の結果',
  versionColumns: {
    product: '対象',
    version: '版',
    status: '状態',
    eol: 'サポート終了日',
    next: '上げる先',
  },
  statuses: {
    ended: 'サポート終了済み',
    'ending-soon': '6 か月以内に終了',
    supported: 'サポート中',
    unknown: '不明',
  } satisfies Record<SupportStatus, string>,
  eolText: (eol: string | undefined, atLeast: boolean | undefined): string =>
    eol ? (atLeast ? `${eol}（少なくとも）` : eol) : '発表なし',
  unlisted: '（一覧に無い版）',
  recommend: (product: string, branch: string) => `${product} ${branch} 系`,
  noRecommend: '—',
  securityLink: (product: string) => `${product} のセキュリティ情報`,
  reviewed: (date: string) =>
    `版の情報は ${date} 時点です（拡張機能は通信しないため自動では新しくなりません）。脆弱性の一覧は持たないため、公式のセキュリティ情報で確かめてください。`,
};

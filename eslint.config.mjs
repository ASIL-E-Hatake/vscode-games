// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// ---- 外部通信の禁止（CLAUDE.md ルール 1）----
// 例外はアップデート確認の src/features/updater/transport.ts だけ。
// 抜け道（動的 import・require・globalThis.fetch など）も塞ぐ（scripts/eslint-network.test.ts で検査）
const NETWORK_MESSAGE =
  '外部通信は禁止です（CLAUDE.md ルール 1。例外はアップデート確認の src/features/updater/transport.ts だけ）';
/** 通信・外部プロセスに使えるモジュール（node: 付きも同じ） */
const NETWORK_MODULES = [
  'http',
  'https',
  'http2',
  'net',
  'tls',
  'dgram',
  'dns',
  'dns/promises',
  'child_process',
  'cluster',
  'inspector',
  'worker_threads',
];
const NETWORK_PACKAGES = ['undici', 'node-fetch', 'axios', 'got', 'ws'];
const restrictedModules = [
  ...NETWORK_MODULES.flatMap((name) => [name, `node:${name}`]),
  ...NETWORK_PACKAGES,
];
// セレクタの正規表現（esquery）には / を書けないため、`dns/promises` などは「dns の後に英数字以外」で表す
const moduleRegExp = `/^(node:)?(${NETWORK_MODULES.filter((m) => !m.includes('/')).join('|')})([^a-z0-9_].*)?$|^(${NETWORK_PACKAGES.join('|')})([^a-z0-9_].*)?$/`;
const networkSyntax = [
  {
    selector: `ImportExpression[source.value=${moduleRegExp}]`,
    message: NETWORK_MESSAGE,
  },
  {
    // 文字列を組み立てた動的 import は、何を読むか検査できないため使わない
    selector: 'ImportExpression:not([source.type="Literal"])',
    message: '動的 import には文字列をそのまま書いてください（外部通信の検査のため）',
  },
  {
    selector: `CallExpression[callee.name="require"][arguments.0.value=${moduleRegExp}]`,
    message: NETWORK_MESSAGE,
  },
  {
    selector: 'CallExpression[callee.name="require"]:not([arguments.0.type="Literal"])',
    message: 'require には文字列をそのまま書いてください（外部通信の検査のため）',
  },
];
const networkGlobals = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'].map((name) => ({
  name,
  message: NETWORK_MESSAGE,
}));
const networkProperties = ['globalThis', 'window', 'self', 'global'].flatMap((object) =>
  ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'].map((property) => ({
    object,
    property,
    message: NETWORK_MESSAGE,
  })),
);

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'out/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      '.vscode-test/**',
      // 並行作業用の worktree（別のチェックアウト。lint の対象にしない）
      '.claude/worktrees/**',
      '*.vsix',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
      // リポジトリ内に worktree（.claude/worktrees/）があると tsconfig の場所を推測できず失敗するため明示する
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'no-console': 'off',
    },
  },
  {
    // 拡張機能の外部通信はアップデート確認（src/features/updater/transport.ts）だけ（CLAUDE.md ルール 1）
    files: ['src/**/*.ts'],
    ignores: ['src/features/updater/transport.ts', '**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: restrictedModules.map((name) => ({ name, message: NETWORK_MESSAGE })) },
      ],
      'no-restricted-syntax': ['error', ...networkSyntax],
      'no-restricted-globals': ['error', ...networkGlobals],
      'no-restricted-properties': ['error', ...networkProperties],
    },
  },
  {
    // Webview（ブラウザ）側
    files: [
      'src/webview-shared/**/*.ts',
      'src/features/*/webview/**/*.ts',
      'tests/webview/game-kit-test/**/*.ts',
      'tests/webview/quiz-kit-test/**/*.ts',
      'tests/webview/file-output-test/**/*.ts',
    ],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      // CSP とセキュリティのため innerHTML / outerHTML / insertAdjacentHTML / document.write を禁止
      'no-restricted-properties': [
        'error',
        {
          property: 'innerHTML',
          message: 'textContent か webview-shared/dom.ts の h() を使ってください',
        },
        {
          property: 'outerHTML',
          message: 'textContent か webview-shared/dom.ts の h() を使ってください',
        },
        {
          property: 'insertAdjacentHTML',
          message: 'webview-shared/dom.ts の h() を使ってください',
        },
        { object: 'document', property: 'write', message: '使用禁止です' },
        // 上の拡張ホスト側の設定を上書きするため、外部通信の禁止も並べる
        ...networkProperties,
      ],
      'no-restricted-globals': ['error', ...networkGlobals],
    },
  },
  {
    // テストでの .only / .skip のコミットを防ぐ
    files: ['**/*.test.ts', 'tests/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'it', property: 'only', message: '.only をコミットしないでください' },
        { object: 'describe', property: 'only', message: '.only をコミットしないでください' },
        { object: 'test', property: 'only', message: '.only をコミットしないでください' },
        {
          object: 'it',
          property: 'skip',
          message: 'スキップは理由と Issue 番号を書いた上でレビューで合意してください',
        },
        {
          object: 'test',
          property: 'skip',
          message: 'スキップは理由と Issue 番号を書いた上でレビューで合意してください',
        },
      ],
    },
  },
);

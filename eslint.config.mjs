// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

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
        {
          paths: ['http', 'https', 'http2', 'net', 'tls', 'dgram'].flatMap((name) =>
            [name, `node:${name}`].map((n) => ({
              name: n,
              message:
                '外部通信は禁止です（CLAUDE.md ルール 1。例外はアップデート確認の src/features/updater/transport.ts だけ）',
            })),
          ),
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: '外部通信は禁止です（CLAUDE.md ルール 1）' },
      ],
    },
  },
  {
    // Webview（ブラウザ）側
    files: [
      'src/webview-shared/**/*.ts',
      'src/features/*/webview/**/*.ts',
      'tests/webview/game-kit-test/**/*.ts',
      'tests/webview/quiz-kit-test/**/*.ts',
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
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: '外部通信は禁止です（CLAUDE.md ルール 1）' },
        { name: 'XMLHttpRequest', message: '外部通信は禁止です（CLAUDE.md ルール 1）' },
        { name: 'WebSocket', message: '外部通信は禁止です（CLAUDE.md ルール 1）' },
      ],
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

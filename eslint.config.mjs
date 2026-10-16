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
      '*.vsix',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'no-console': 'off',
    },
  },
  {
    // Webview（ブラウザ）側
    files: [
      'src/webview-shared/**/*.ts',
      'src/features/*/webview/**/*.ts',
      'tests/webview/game-kit-test/**/*.ts',
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

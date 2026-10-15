import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { features } from '../index';
import {
  FEEDBACK_TEMPLATE,
  FEEDBACK_TITLE_PREFIX,
  feedbackUrl,
  platformLabel,
  repositoryPage,
} from './logic';

const REPO = 'https://github.com/example-org/example-repo';
const env = {
  extensionVersion: '0.1.0',
  vscodeVersion: '1.120.0',
  platform: 'win32',
  theme: 'Default Dark Modern',
};

describe('repositoryPage', () => {
  it.each([
    ['https://github.com/example-org/example-repo.git', REPO],
    ['git+https://github.com/example-org/example-repo.git', REPO],
    ['https://github.com/example-org/example-repo', REPO],
    ['https://github.com/example-org/example-repo/', REPO],
  ])('%s → %s', (input, expected) => {
    expect(repositoryPage(input)).toBe(expected);
  });

  it.each([
    undefined,
    'https://example.com/repo.git',
    'git@github.com:example-org/example-repo.git',
  ])('GitHub の https URL 以外は undefined（%s）', (input) => {
    expect(repositoryPage(input)).toBeUndefined();
  });
});

describe('feedbackUrl', () => {
  it('フィードバック用テンプレートを指定し、環境とバージョンを記入済みにする', () => {
    const url = new URL(feedbackUrl(REPO, env));
    expect(`${url.origin}${url.pathname}`).toBe(`${REPO}/issues/new`);
    expect(url.searchParams.get('template')).toBe(FEEDBACK_TEMPLATE);
    expect(url.searchParams.get('environment')).toBe(
      'Windows / VS Code 1.120.0 / Default Dark Modern',
    );
    expect(url.searchParams.get('version')).toBe('0.1.0');
    expect(url.searchParams.has('title')).toBe(false);
  });

  it('機能名を渡すとタイトルに入れる。テーマが分からなければ省く', () => {
    const url = new URL(feedbackUrl(REPO, { ...env, theme: undefined }, 'スライドパズル'));
    expect(url.searchParams.get('title')).toBe('[フィードバック] スライドパズル: ');
    expect(url.searchParams.get('environment')).toBe('Windows / VS Code 1.120.0');
  });

  it('OS 名を読みやすくする（知らない値はそのまま）', () => {
    expect(platformLabel('darwin')).toBe('macOS');
    expect(platformLabel('linux')).toBe('Linux');
    expect(platformLabel('freebsd')).toBe('freebsd');
  });
});

/** Issue フォームの定義（使う部分だけ） */
interface IssueForm {
  title: string;
  body: { type: string; id?: string; attributes: { options?: string[] } }[];
}

describe('Issue テンプレートとの整合', () => {
  const form = load(
    readFileSync(join('.github', 'ISSUE_TEMPLATE', FEEDBACK_TEMPLATE), 'utf8'),
  ) as IssueForm;
  const field = (id: string) => form.body.find((b) => b.id === id);

  it('URL で記入する項目（environment / version）とタイトルの初期値がテンプレートと合っている', () => {
    for (const id of ['environment', 'version']) expect(field(id)).toBeDefined();
    expect(form.title).toBe(FEEDBACK_TITLE_PREFIX);
  });

  it('「機能」の選択肢が、画面を持つ機能の名前と一致している（機能を追加したらテンプレートも更新する）', () => {
    const titles = features.filter((f) => f.kind === 'webview').map((f) => f.title);
    expect([...(field('feature')?.attributes.options ?? [])].sort()).toEqual(
      ['全体', ...titles].sort(),
    );
  });
});

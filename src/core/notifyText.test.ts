import { describe, expect, it } from 'vitest';
import { notifyText } from './notifyText';

describe('notifyText（通知のリンク化の防止）', () => {
  it('Markdown のリンクの形を崩す', () => {
    const name = '[ここを押す](command:workbench.action.terminal.new)';
    const text = notifyText(`問題パック「${name}」を取り込みました`);
    expect(text).not.toMatch(/\[[^\]]*\]\(/);
    expect(text).toBe(
      '問題パック「［ここを押す］（command:workbench.action.terminal.new）」を取り込みました',
    );
  });

  it('入れ子・URL の形も崩す', () => {
    expect(notifyText('[![x](https://example.com/a.png)](https://example.com)')).not.toMatch(
      /[[\]()]/,
    );
  });

  it('記号の無い文字列はそのまま', () => {
    expect(notifyText('C:\\Users\\test\\links.yaml を書き出しました（3 件）')).toBe(
      'C:\\Users\\test\\links.yaml を書き出しました（3 件）',
    );
  });
});

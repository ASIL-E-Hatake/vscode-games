import { describe, expect, it } from 'vitest';
import {
  diffMaps,
  javaProgram,
  ourMap,
  parseJavaOutput,
  PROPERTIES_SAMPLES,
  roundTripSample,
} from './spring-config-snippets';

const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');

describe('Spring Boot の設定変換の L2 検査の部品', () => {
  it('jshell のコードは例を Base64 で埋め込む', () => {
    const code = javaProgram(['a=1']);
    expect(code).toContain(`dump(0, "${b64('a=1')}");`);
    expect(code).toContain('java.util.Properties');
  });

  it('jshell の出力を例ごとのキー → 値にする（空のキー・値も）', () => {
    const out = `0 ${b64('a')} ${b64('あ')}\n1  \nnoise\n1 ${b64('k')} ${b64('')}\n`;
    expect(parseJavaOutput(out, 2)).toEqual([{ a: 'あ' }, { '': '', k: '' }]);
  });

  it('違いを見つける', () => {
    expect(diffMaps({ a: '1', b: '2' }, { b: '2', a: '1' })).toBeUndefined();
    expect(diffMaps({ a: '1' }, { a: '2' })).toContain('Java の読み');
  });

  it('こちらの読みで、すべての例を読める', () => {
    for (const sample of [...PROPERTIES_SAMPLES, roundTripSample()]) {
      expect(Object.keys(ourMap(sample)).length).toBeGreaterThan(0);
    }
  });
});

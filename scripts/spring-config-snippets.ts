// L2 Spring Boot の設定変換（spring-config）の実行検査: properties の読み（src/features/spring-config/properties.ts）を
// Java の java.util.Properties#load（jshell）と突き合わせる。test-snippets.ts から呼ばれ、結果は同じ JUnit にまとめる。
// - 行の継続・区切り・コメント・エスケープなど、構文の境界を集めた例を Java と同じに読めるか
// - こちらで書いた properties の行（エスケープ）を Java が元の値に読み戻すか
// - 検査が機能していることを、わざと違う値にした読みが不合格になることで毎回確認する
import { parseProperties, propertiesLine } from '../src/features/spring-config/properties';
import type { SnippetCase } from './quiz-snippets';
import { run, runnerFor } from './snippet-runner';

/** 構文の境界の例（1 つの例 = 1 つのファイル。#--- の複数文書は Java ではコメントになるため含めない） */
export const PROPERTIES_SAMPLES: string[] = [
  'a=1\nb:2\nc 3\nd = 4\ne : 5\nf\t=\t6\ng   7',
  'a = = b\nc : : d\ne==f\ng::h',
  'url=jdbc:postgresql://db:5432/app?a=b&c=d',
  'a=\nb\nc:\n=d',
  '# コメント\n  ! これも\na=1 # 値の一部',
  '\n   \n\ta=1\n\n',
  'a=one, \\\n    two, \\\n\tthree',
  'a=c:\\\\\nb=2',
  'a=1\\\n#2',
  '# x \\\na=1',
  'a=1\\',
  'a=1\r\nb=2\rc=3',
  'a=\\t\\n\\r\\f\nb=\\u3042\\u3044\nc=\\q\\=\\:\\#',
  'my\\ key\\=x\\:y=v\n\\#notcomment=1',
  'a=\\  b\nc=trailing  ',
  'a=1\nb=2\na=3',
  'a=日本語のまま\nb=\\uD83D\\uDE00',
  'key\\\n  continued=value',
];

/** 書いた行を Java が読み戻すか確かめる値 */
const ROUND_TRIP_VALUES = [
  ' 先頭の空白',
  'C:\\a\\b',
  '改行\nあり',
  'tab\t',
  '=:#!',
  '',
  '\\u0041',
  '😀',
  'a b c ',
];

export function roundTripSample(): string {
  return [
    ...ROUND_TRIP_VALUES.map((value, i) => propertiesLine({ key: `k${i}`, value })),
    propertiesLine({ key: 'key with=sep:', value: 'v' }),
    propertiesLine({ key: '#hash', value: 'v' }),
  ].join('\n');
}

const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');
const unb64 = (text: string) => Buffer.from(text, 'base64').toString('utf8');

/** 例を順に Properties#load で読み、「番号 キー 値」（Base64）を出す jshell のコード */
export function javaProgram(samples: readonly string[]): string {
  return [
    'String d(String s) { return new String(java.util.Base64.getDecoder().decode(s), java.nio.charset.StandardCharsets.UTF_8); }',
    'String e(String s) { return java.util.Base64.getEncoder().encodeToString(s.getBytes(java.nio.charset.StandardCharsets.UTF_8)); }',
    'void dump(int i, String text) throws Exception { var p = new java.util.Properties(); p.load(new java.io.StringReader(d(text))); for (String k : new java.util.TreeSet<>(p.stringPropertyNames())) System.out.println(i + " " + e(k) + " " + e(p.getProperty(k))); }',
    ...samples.map((s, i) => `dump(${i}, "${b64(s)}");`),
  ].join('\n');
}

/** jshell の出力を、例ごとのキー → 値にする */
export function parseJavaOutput(stdout: string, count: number): Record<string, string>[] {
  const maps: Record<string, string>[] = Array.from({ length: count }, () => ({}));
  for (const line of stdout.split(/\r?\n/)) {
    const m = /^(\d+) (\S*) (\S*)$/.exec(line);
    if (m) maps[Number(m[1])]![unb64(m[2]!)] = unb64(m[3]!);
  }
  return maps;
}

/** こちらの読み（全文書をまとめ、後のほうが勝つ） */
export function ourMap(text: string): Record<string, string> {
  return Object.fromEntries(
    parseProperties(text).docs.flatMap((d) => d.entries.map((e) => [e.key, e.value])),
  );
}

/** 2 つの読みの違い（無ければ undefined） */
export function diffMaps(
  ours: Record<string, string>,
  java: Record<string, string>,
): string | undefined {
  const a = JSON.stringify(Object.entries(ours).sort());
  const b = JSON.stringify(Object.entries(java).sort());
  return a === b ? undefined : `こちらの読み: ${a}\nJava の読み: ${b}`;
}

export function springConfigTasks(cases: SnippetCase[]): (() => Promise<void>)[] {
  const samples = [...PROPERTIES_SAMPLES, roundTripSample()];
  const names = samples.map((_, i) =>
    i < PROPERTIES_SAMPLES.length
      ? `java / Spring Boot の設定変換 / properties の読み ${i + 1}`
      : 'java / Spring Boot の設定変換 / 書いた properties を Java が読み戻す',
  );
  const canaryName = 'java / Spring Boot の設定変換 / （検証の確認）違う読みを不合格と判定できる';
  const runner = runnerFor('java');
  if (!runner) {
    cases.push(...[...names, canaryName].map((name) => ({ name, skipped: true })));
    return [];
  }
  return [
    async () => {
      const result = await run(runner, javaProgram(samples));
      const java = parseJavaOutput(result.stdout, samples.length);
      samples.forEach((sample, i) => {
        const problem = result.ok
          ? diffMaps(ourMap(sample), java[i]!)
          : result.output.slice(0, 2000);
        cases.push({ name: names[i]!, failure: problem });
        console.log(`${problem ? '✘' : '✔'} ${names[i]}`);
        if (problem) console.log(problem);
      });
      // 例 1 の読みをわざと変えると、違いとして見つかること
      const broken = { ...ourMap(samples[0]!), a: 'wrong' };
      const detected = !!diffMaps(broken, java[0]!);
      cases.push({
        name: canaryName,
        failure: detected ? undefined : '違う読みが合格と判定されました',
      });
      console.log(`${detected ? '✔' : '✘'} ${canaryName}`);
    },
  ];
}

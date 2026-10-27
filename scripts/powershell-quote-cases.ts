// L2 PowerShell の引用の検査で使う例（command-snippets.ts とユニットテストで共用）。
// 値に PowerShell の引用符（' ‘ ’ ‚ ‛）と命令を入れても、生成したコマンドの中で別の命令にならないことを
// PowerShell のパーサーで確かめるための入力と、結果の判定。
import { buildCommand } from '../src/features/command-builder/logic';
import { quote } from '../src/features/command-builder/quote';
import type { CommandTemplate, ParamValues } from '../src/features/command-builder/types';
import { convertInput } from '../src/features/path-converter/logic';
import { envLine } from '../src/features/spring-config/env';

/** 入れたら別の命令（Write-Output INJECTED）が動いてしまう値の例 */
export const INJECTED_COMMAND = 'Write-Output';
export const INJECTIONS = [
  'C:\\tmp\\x’; Write-Output INJECTED; ’',
  "x'; Write-Output INJECTED; '",
  'x‘; Write-Output INJECTED; ‘',
  'x‚; Write-Output INJECTED; ‚',
  'x‛; Write-Output INJECTED; ‛',
  'x’’; Write-Output INJECTED; ’',
  '$(Write-Output INJECTED) `n ${env:PATH}',
];

/** 引用した値が 1 つの文・1 つの文字列になるかを確かめる例 */
export interface QuoteCase {
  name: string;
  command: string;
  /** 一重引用符の文字列として読めるはずの値 */
  value: string;
}

export function quoteCases(): QuoteCase[] {
  return INJECTIONS.flatMap((value, i) => {
    const converted = convertInput(value);
    const path = converted.ok
      ? converted.items.find((c) => c.id === 'powershellQuote')?.value
      : undefined;
    const cases: QuoteCase[] = [
      {
        name: `Spring Boot の設定変換 / $env: の値 ${i + 1}`,
        command: envLine({ name: 'SPRING_DATASOURCE_PASSWORD', value }, 'powershell'),
        value,
      },
      {
        name: `コマンド組み立て / 引用 ${i + 1}`,
        command: `Write-Host ${quote(value, 'powershell')}`,
        value,
      },
    ];
    // パス変換は入力をパスとして読み直すため、値が変わる。引用した文字列が 1 つになることだけ確かめる
    if (path !== undefined) {
      cases.push({
        name: `パス変換 / PowerShell 用 ${i + 1}`,
        command: `Get-Item -LiteralPath ${path}`,
        value: path.slice(1, -1).replace(/(['‘’‚‛])\1/g, '$1'),
      });
    }
    return cases;
  });
}

/** 検査が機能しているかの確認用: 以前の誤った引用（' だけを重ねる） */
export const BROKEN_QUOTE_CASE: QuoteCase = {
  name: '（検証の確認）’ を重ねない引用を不合格と判定できる',
  command: `Get-Item -LiteralPath '${INJECTIONS[0]!.replace(/'/g, "''")}'`,
  value: INJECTIONS[0]!,
};

/** PowerShell のパーサーの結果（command-snippets.ts の検査スクリプトが返す形の一部） */
export interface ParsedShape {
  problems: string[];
  /** 最上位の文の数 */
  statements: number;
  /** 一重引用符の文字列の値 */
  literals: string[];
  commands: { name: string }[];
}

/** 引用の例の問題（無ければ空） */
export function quoteCaseProblems(c: QuoteCase, parsed: ParsedShape): string[] {
  const problems = [...parsed.problems];
  if (parsed.statements !== 1) problems.push(`文が ${parsed.statements} 個になっています`);
  if (parsed.commands.some((x) => x.name === INJECTED_COMMAND)) {
    problems.push(`値の中の ${INJECTED_COMMAND} が命令として読まれています`);
  }
  if (!parsed.literals.includes(c.value)) {
    problems.push(`引用した値が元に戻りません（読めた値: ${JSON.stringify(parsed.literals)}）`);
  }
  return problems;
}

/** ひな形の例の入力（文字列の値）の後ろに、命令を入れた値を足したもの（変えられる値が無ければ undefined） */
export function injectedInput(t: CommandTemplate, input: ParamValues): ParamValues | undefined {
  let changed = false;
  const out: ParamValues = { ...input };
  for (const p of t.params) {
    const v = input[p.id];
    if ((p.type === 'text' || p.type === 'path') && typeof v === 'string' && v !== '') {
      out[p.id] = `${v}${INJECTIONS[0]!.slice('C:\\tmp\\x'.length)}`;
      changed = true;
    }
  }
  return changed ? out : undefined;
}

/** 命令を入れた値で組み立てた PowerShell のコマンド（組み立てられなければ undefined） */
export function injectedCommand(t: CommandTemplate, input: ParamValues): string | undefined {
  const injected = injectedInput(t, input);
  if (!injected) return undefined;
  const result = buildCommand(t, injected, 'powershell');
  return result.status === 'ok' ? result.command : undefined;
}

/** 命令を入れた例の問題: 文の数が元の例と同じで、入れた命令が読まれていないこと */
export function injectedProblems(original: ParsedShape, injected: ParsedShape): string[] {
  const problems = [...injected.problems];
  if (injected.statements !== original.statements) {
    problems.push(`文の数が ${original.statements} から ${injected.statements} に変わりました`);
  }
  if (injected.commands.some((x) => x.name === INJECTED_COMMAND)) {
    problems.push(`値の中の ${INJECTED_COMMAND} が命令として読まれています`);
  }
  return problems;
}

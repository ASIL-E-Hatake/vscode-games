// ひな形ファイル（content/command-builder）の検査。スキーマでは確かめられない整合性と、
// 全 examples の生成結果が output と一致するかを調べる（scripts/content.ts のビルド・L2 テストで使う）
import { buildCommand, isSupported } from './logic';
import {
  SHELLS,
  type CommandPart,
  type CommandTemplate,
  type Condition,
  type TemplateFile,
} from './types';

const PLACEHOLDER = /\{([a-zA-Z0-9_-]+)\}/g;

function conditionParam(condition: Condition | undefined): string | undefined {
  if (condition === undefined) return undefined;
  return typeof condition === 'string' ? condition : condition.param;
}

/** 部品・条件が参照するパラメータ ID */
function referencedParams(template: CommandTemplate): string[] {
  const parts: CommandPart[] = [
    ...(template.shells.all ?? []),
    ...SHELLS.flatMap((s) => {
      const p = template.shells[s];
      return Array.isArray(p) ? p : [];
    }),
  ];
  const ids: (string | undefined)[] = [
    ...parts.flatMap((p) => [
      conditionParam(p.when),
      'param' in p ? p.param : undefined,
      ...('format' in p ? [...p.format.matchAll(PLACEHOLDER)].map((m) => m[1]) : []),
    ]),
    ...(template.warnings ?? []).map((w) => conditionParam(w.when)),
  ];
  return ids.filter((id): id is string => id !== undefined);
}

function checkTemplate(t: CommandTemplate): string[] {
  const errors: string[] = [];
  const at = (message: string) => errors.push(`${t.id}: ${message}`);
  const paramIds = t.params.map((p) => p.id);
  paramIds
    .filter((id, i) => paramIds.indexOf(id) !== i)
    .forEach((id) => at(`パラメータ ID が重複しています: ${id}`));
  for (const id of new Set(referencedParams(t))) {
    if (!paramIds.includes(id)) at(`存在しないパラメータを参照しています: ${id}`);
  }
  for (const p of t.params) {
    if (p.type === 'select' && !(p.options ?? []).length)
      at(`${p.id}: select には options が必要です`);
    if (p.type === 'select' && p.default !== undefined) {
      if (!(p.options ?? []).some((o) => o.value === p.default)) {
        at(`${p.id}: default が options にありません`);
      }
    }
    if (p.type === 'flag' && p.required) at(`${p.id}: flag に required は付けられません`);
  }

  const { all } = t.shells;
  if (all && SHELLS.some((s) => t.shells[s] !== undefined)) {
    at('shells には all か bash / powershell のどちらかだけを書いてください');
  }
  if (!all && SHELLS.some((s) => t.shells[s] === undefined)) {
    at('shells には bash と powershell の両方（または all）が必要です');
  }
  const supported = SHELLS.filter((s) => isSupported(t, s));
  if (supported.length === 0) at('少なくとも 1 つのシェルに対応してください');

  // examples: 対応する全シェルに 1 つ以上・未対応のシェルの出力は書かない・生成結果が一致する
  for (const shell of SHELLS) {
    const outputs = t.examples.filter((e) => e.output[shell] !== undefined);
    if (supported.includes(shell) && outputs.length === 0) {
      at(`${shell} の examples がありません`);
    }
    if (!supported.includes(shell) && outputs.length > 0) {
      at(`${shell} は未対応（unsupported）なので examples の output に書かないでください`);
    }
  }
  t.examples.forEach((example, i) => {
    for (const key of Object.keys(example.input)) {
      if (!paramIds.includes(key)) at(`examples[${i}]: 存在しないパラメータです: ${key}`);
    }
    for (const shell of SHELLS) {
      const expected = example.output[shell];
      if (expected === undefined || !supported.includes(shell)) continue;
      const result = buildCommand(t, example.input, shell);
      if (result.status !== 'ok') {
        at(`examples[${i}] (${shell}): コマンドになりません（${result.status}）`);
      } else if (result.command !== expected) {
        at(
          `examples[${i}] (${shell}): 生成結果が違います\n  期待: ${expected}\n  実際: ${result.command}`,
        );
      }
    }
  });
  return errors;
}

/** 1 ファイル分の検査。エラーメッセージの配列を返す */
export function checkTemplateFile(file: TemplateFile): string[] {
  const ids = file.templates.map((t) => t.id);
  return [
    ...ids.filter((id, i) => ids.indexOf(id) !== i).map((id) => `id が重複しています: ${id}`),
    ...file.templates.flatMap(checkTemplate),
  ];
}

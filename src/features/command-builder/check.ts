// ひな形ファイル（content/command-builder）の検査。スキーマでは確かめられない整合性と、
// 全 examples の生成結果が output と一致するかを調べる（scripts/content.ts のビルド・L2 テストで使う）
import { buildCommand, isSupported } from './logic';
import {
  SHELLS,
  type CommandPart,
  type CommandTemplate,
  type Condition,
  type TemplateFile,
  type VariantTemplate,
} from './types';
import { expandTemplate, isVariantTemplate } from './variants';

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

/** 道具ごとの部品（variants）の検査。部品が正しい道具は、展開したひな形をふつうのひな形と同じに調べる */
function checkVariantTemplate(t: VariantTemplate): string[] {
  const errors: string[] = [];
  const at = (message: string) => errors.push(`${t.id}: ${message}`);
  const ids = t.variants.map((v) => v.id);
  ids
    .filter((id, i) => ids.indexOf(id) !== i)
    .forEach((id) => at(`道具の ID が重複しています: ${id}`));
  if (t.variants.length < 2) at('variants には 2 つ以上の道具を書いてください');
  if (t.variants.every((v) => v.unsupported)) at('少なくとも 1 つの道具に対応してください');
  for (const v of t.variants) {
    if (v.unsupported && (v.shells || v.examples)) {
      at(`${v.id}: unsupported の道具には shells・examples を書かないでください`);
    }
    if (!v.unsupported && (!v.shells || !v.examples)) {
      at(`${v.id}: shells と examples（または unsupported）が必要です`);
    }
  }
  if (errors.length > 0) return errors;
  return expandTemplate(t)
    .filter((e) => !e.variant?.unsupported)
    .flatMap(checkTemplate);
}

/** 1 ファイル分の検査。エラーメッセージの配列を返す */
export function checkTemplateFile(file: TemplateFile): string[] {
  const ids = file.templates.flatMap(expandTemplate).map((t) => t.id);
  return [
    ...ids.filter((id, i) => ids.indexOf(id) !== i).map((id) => `id が重複しています: ${id}`),
    ...file.templates.flatMap((t) =>
      isVariantTemplate(t) ? checkVariantTemplate(t) : checkTemplate(t),
    ),
  ];
}

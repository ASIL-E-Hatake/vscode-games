// 手順のデータ（content/runtime-guide/*.yaml）の L2 の追加検査（スキーマで表せないもの）。DOM 非依存。
import { PARAM_IDS, VALUE_NAMES } from './input';
import { conditionParam, placeholdersOf, stepFiles } from './logic';
import type { GuideCondition, GuideOs, GuideTopicData, ParamId } from './types';

/** 1 つの対象のファイルを検査する。エラーメッセージの配列を返す */
export function checkGuideTopicFile(data: unknown): string[] {
  const topic = data as GuideTopicData;
  const errors: string[] = [];
  const params = new Set<string>(topic.params);
  for (const p of topic.params) {
    if (!PARAM_IDS.includes(p as ParamId)) errors.push(`params に知らない入力欄があります: ${p}`);
  }
  const values = new Set(VALUE_NAMES);
  const checkText = (where: string, text: string | undefined) => {
    if (!text) return;
    for (const name of placeholdersOf(text)) {
      if (!values.has(name)) errors.push(`${where}: 知らない名前 {{${name}}}`);
      // 入力欄の値を使うなら、その欄を params に挙げる（画面に入力欄を出すため）
      else if (PARAM_IDS.includes(name as ParamId) && !params.has(name)) {
        errors.push(`${where}: {{${name}}} を使うときは params に ${name} を入れてください`);
      }
    }
  };
  const checkCondition = (where: string, condition: GuideCondition | undefined) => {
    if (!condition) return;
    const name = conditionParam(condition);
    if (!name || !values.has(name))
      errors.push(`${where}: 条件の名前が知らないものです: ${condition}`);
  };
  const checkOs = (where: string, os: readonly GuideOs[] | undefined) => {
    for (const o of os ?? []) {
      if (!topic.os.includes(o)) errors.push(`${where}: 対象が対応しない OS です: ${o}`);
    }
  };

  const ids = new Set<string>();
  for (const step of topic.steps) {
    const at = `${topic.topic}/${step.id}`;
    if (ids.has(step.id)) errors.push(`${at}: 手順の id が重複しています`);
    ids.add(step.id);
    checkOs(at, step.os);
    checkCondition(at, step.when);
    checkText(`${at} の why`, step.why);
    checkText(`${at} の danger`, step.danger);
    for (const p of step.pitfalls ?? []) checkText(`${at} の pitfalls`, p);
    if (step.file && step.files) errors.push(`${at}: file と files はどちらか一方にしてください`);
    const hasContent =
      (step.commands?.length ?? 0) > 0 || stepFiles(step).length > 0 || !!step.goto || !!step.why;
    if (!hasContent) errors.push(`${at}: commands・file・goto・why のどれかが要ります`);
    (step.commands ?? []).forEach((c, i) => {
      const where = `${at} の commands[${i}]`;
      checkOs(where, c.os);
      checkCondition(where, c.when);
      checkText(where, c.text);
      checkText(where, c.explain);
      if (/^\s*sudo\s+-s\b|\bsudo\s+su\b/.test(c.text)) {
        errors.push(`${where}: root のシェルに入る書き方（sudo -s / sudo su）は使わない`);
      }
      if (/\|\s*(sudo\s+)?(ba)?sh\b|\|\s*Invoke-Expression\b|\|\s*iex\b/i.test(c.text)) {
        if (!/Out-String \| Invoke-Expression/.test(c.text)) {
          errors.push(`${where}: ダウンロードしたものをそのまま実行しない（curl | sh・irm | iex）`);
        }
      }
    });
    stepFiles(step).forEach((f, i) => {
      if ('generator' in f) return;
      const where = `${at} の files[${i}]`;
      checkText(where, f.name);
      f.lines.forEach((l, j) => {
        checkOs(`${where}.lines[${j}]`, l.os);
        checkCondition(`${where}.lines[${j}]`, l.when);
        checkText(`${where}.lines[${j}]`, l.text);
      });
    });
    if (step.goto === topic.topic) errors.push(`${at}: goto に自分自身は指定できません`);
  }
  for (const p of topic.pitfalls ?? []) checkText(`${topic.topic} の pitfalls`, p);
  return errors;
}

/** 対象をまたぐ検査（topic の重複・goto の行き先）。エラーメッセージの配列を返す */
export function checkGuideTopics(topics: readonly GuideTopicData[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const t of topics) {
    if (ids.has(t.topic)) errors.push(`topic が重複しています: ${t.topic}`);
    ids.add(t.topic);
  }
  for (const t of topics) {
    for (const s of t.steps) {
      if (s.goto && !ids.has(s.goto))
        errors.push(`${t.topic}/${s.id}: goto の行き先がありません: ${s.goto}`);
    }
  }
  return errors;
}

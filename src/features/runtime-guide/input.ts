// 実行環境・サーバー構築ガイドの入力: 入力欄の定義・検査・保存した値の復元・手順に入れる値。DOM 非依存。
// generators/（設定ファイルの組み立て）も validateGuideInput() と guideValues() を使ってよい。
import {
  DEFAULT_GUIDE_INPUT,
  GUIDE_JAVA_VERSIONS,
  GUIDE_NODE_VERSIONS,
  GUIDE_OSES,
  temurinHome,
  type GuideInput,
  type GuideOs,
  type ParamId,
} from './types';

export type ParamType = 'text' | 'path' | 'number' | 'select' | 'flag';

export interface ParamDef {
  type: ParamType;
  /** select の選択肢 */
  options?: readonly string[];
  /** 値の形（text・path。合わなければ入力の誤りとして表示する） */
  pattern?: RegExp;
}

const NAME = /^[a-z_][a-z0-9_-]{0,31}$/;
/** 空白・引用符・$ などを含まない絶対パス（systemd・Nginx の設定にそのまま入れるため） */
const ABS_PATH = /^\/[A-Za-z0-9._/-]*$/;
const TOMCAT_VERSION = /^(9|10|11)\.\d{1,2}\.\d{1,3}$/;

export const PARAM_DEFS: Record<ParamId, ParamDef> = {
  javaVersion: { type: 'select', options: GUIDE_JAVA_VERSIONS },
  javaPrevVersion: { type: 'select', options: GUIDE_JAVA_VERSIONS },
  nodeVersion: { type: 'select', options: GUIDE_NODE_VERSIONS },
  nodePrevVersion: { type: 'select', options: GUIDE_NODE_VERSIONS },
  tomcatVersion: { type: 'text', pattern: TOMCAT_VERSION },
  tomcatPrevVersion: { type: 'text', pattern: TOMCAT_VERSION },
  appName: { type: 'text', pattern: /^[a-z][a-z0-9-]{0,31}$/ },
  appUser: { type: 'text', pattern: NAME },
  appPort: { type: 'number' },
  installDir: { type: 'path', pattern: ABS_PATH },
  jarName: { type: 'text', pattern: /^[A-Za-z0-9._-]{1,64}\.jar$/ },
  javaOpts: { type: 'text', pattern: /^[A-Za-z0-9 _.:=+\-/%,@]{0,200}$/ },
  springProfile: { type: 'text', pattern: /^[A-Za-z0-9_,-]{0,64}$/ },
  healthPath: { type: 'path', pattern: /^\/[A-Za-z0-9._/-]{0,100}$/ },
  tomcatRoot: { type: 'path', pattern: ABS_PATH },
  catalinaBase: { type: 'path', pattern: ABS_PATH },
  tomcatUser: { type: 'text', pattern: NAME },
  domain: {
    type: 'text',
    pattern:
      /^(?=.{1,253}$)[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/,
  },
  tls: { type: 'flag' },
  certPath: { type: 'path', pattern: ABS_PATH },
  keyPath: { type: 'path', pattern: ABS_PATH },
  httpRedirect: { type: 'flag' },
  maxBodySize: { type: 'text', pattern: /^\d{1,6}[kKmMgG]?$/ },
  winNodeTool: { type: 'select', options: ['fnm', 'volta', 'nvm-windows'] },
};

export const PARAM_IDS = Object.keys(PARAM_DEFS) as ParamId[];

/** 入力の誤り（入力欄の ID と、その欄のラベルを付ける前の理由の種類） */
export interface InputError {
  param: ParamId;
  kind: 'format' | 'port' | 'same';
}

/**
 * 入力を検査する（params に挙げた欄だけ。省略時はすべて）。誤りが無ければ空。
 * 手順・設定ファイルには検査を通った値だけを入れる（設定ファイルの中で命令や別の設定にならないように）
 */
export function validateGuideInput(
  input: GuideInput,
  params: readonly ParamId[] = PARAM_IDS,
): InputError[] {
  const errors: InputError[] = [];
  for (const id of params) {
    const def = PARAM_DEFS[id];
    const value = input[id];
    if (def.type === 'number') {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1 || n > 65535) errors.push({ param: id, kind: 'port' });
    } else if (def.type === 'select') {
      if (!def.options?.includes(String(value))) errors.push({ param: id, kind: 'format' });
    } else if (def.pattern && !def.pattern.test(String(value))) {
      errors.push({ param: id, kind: 'format' });
    }
  }
  // 上げる先と戻す先が同じだと、戻す手順が意味をなさない
  if (params.includes('javaPrevVersion') && input.javaPrevVersion === input.javaVersion) {
    errors.push({ param: 'javaPrevVersion', kind: 'same' });
  }
  if (params.includes('nodePrevVersion') && input.nodePrevVersion === input.nodeVersion) {
    errors.push({ param: 'nodePrevVersion', kind: 'same' });
  }
  if (params.includes('tomcatPrevVersion') && input.tomcatPrevVersion === input.tomcatVersion) {
    errors.push({ param: 'tomcatPrevVersion', kind: 'same' });
  }
  return errors;
}

/** 保存した値（壊れている・古い形でもよい）から入力を復元する。足りない・型の違う値は既定値 */
export function restoreGuideInput(value: unknown): GuideInput {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const d = DEFAULT_GUIDE_INPUT;
  const out: Record<string, unknown> = { ...d };
  out['os'] = GUIDE_OSES.includes(v['os'] as GuideOs) ? v['os'] : d.os;
  for (const id of PARAM_IDS) {
    const def = PARAM_DEFS[id];
    const x = v[id];
    if (def.type === 'flag') {
      if (typeof x === 'boolean') out[id] = x;
    } else if (def.type === 'number') {
      if (typeof x === 'number' && Number.isFinite(x)) out[id] = x;
    } else if (def.type === 'select') {
      if (typeof x === 'string' && def.options?.includes(x)) out[id] = x;
    } else if (typeof x === 'string' && x.length <= 300) {
      out[id] = x;
    }
  }
  return out as unknown as GuideInput;
}

/**
 * 手順の {{名前}} に入れる値。入力の値（文字列にしたもの）と、入力から決まる値。
 * - javaHome / javaPrevHome: Temurin の JAVA_HOME
 * - tomcatMajor: Tomcat のメジャー版（ダウンロードの URL）
 * - tomcatHome: 版ごとの本体のフォルダ / tomcatCurrent: 今使う本体を指すシンボリックリンク
 * - javaAltPath / javaPrevAltPath: alternatives に登録される java の実体（Temurin の RPM。実機で確認）
 * - tomcatPrevHome: 戻すときの本体のフォルダ
 * - nodeBin / nodePrevBin: Amazon Linux 2023 の alternatives の node の実体
 * - scheme: tls なら https、無ければ http
 */
export function guideValues(input: GuideInput): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) values[key] = String(value);
  values['javaHome'] = temurinHome(input.javaVersion);
  values['javaPrevHome'] = temurinHome(input.javaPrevVersion);
  values['tomcatMajor'] = input.tomcatVersion.split('.')[0] ?? '';
  values['tomcatHome'] = `${input.tomcatRoot}/apache-tomcat-${input.tomcatVersion}`;
  values['tomcatCurrent'] = `${input.tomcatRoot}/current`;
  values['javaAltPath'] = `/usr/lib/jvm/java-${input.javaVersion}-temurin-jdk/bin/java`;
  values['javaPrevAltPath'] = `/usr/lib/jvm/java-${input.javaPrevVersion}-temurin-jdk/bin/java`;
  values['tomcatPrevHome'] = `${input.tomcatRoot}/apache-tomcat-${input.tomcatPrevVersion}`;
  values['nodeBin'] = `/usr/bin/node-${input.nodeVersion}`;
  values['nodePrevBin'] = `/usr/bin/node-${input.nodePrevVersion}`;
  values['scheme'] = input.tls ? 'https' : 'http';
  return values;
}

/** guideValues() が返す名前（L2 で手順のデータの {{名前}} を検査する） */
export const VALUE_NAMES: readonly string[] = Object.keys(guideValues(DEFAULT_GUIDE_INPUT));

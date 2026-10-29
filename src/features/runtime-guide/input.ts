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
import { err } from './generators/strings';
import {
  catalinaHome,
  checkAppName,
  checkDomain,
  checkJarName,
  checkJavaOpts,
  checkMaxBodySize,
  checkPath,
  checkPort,
  checkProfile,
  checkTomcatVersion,
  checkUser,
} from './generators/validate';
import { strings } from './strings';

export type ParamType = 'text' | 'path' | 'number' | 'select' | 'flag';

export interface ParamDef {
  type: ParamType;
  /** select の選択肢 */
  options?: readonly string[];
  /**
   * 値の検査（text・path・number）。誤りなら理由の文を返す。
   * 設定ファイルの組み立て（generators/validate.ts）と同じ検査を使い、組み立ての前に画面で分かるようにする
   */
  check?: (value: string | number) => string | undefined;
}

const L = strings.params;
const text = (f: (v: string) => string | undefined) => (v: string | number) => f(String(v));
const path = (label: string) => text((v) => checkPath(label, v));
const TOMCAT = text(checkTomcatVersion);

export const PARAM_DEFS: Record<ParamId, ParamDef> = {
  javaVersion: { type: 'select', options: GUIDE_JAVA_VERSIONS },
  javaPrevVersion: { type: 'select', options: GUIDE_JAVA_VERSIONS },
  nodeVersion: { type: 'select', options: GUIDE_NODE_VERSIONS },
  nodePrevVersion: { type: 'select', options: GUIDE_NODE_VERSIONS },
  tomcatVersion: { type: 'text', check: TOMCAT },
  tomcatPrevVersion: { type: 'text', check: TOMCAT },
  appName: { type: 'text', check: text(checkAppName) },
  appUser: { type: 'text', check: text((v) => checkUser(L.appUser, v)) },
  appPort: { type: 'number', check: (v) => checkPort(Number(v)) },
  installDir: { type: 'path', check: path(L.installDir) },
  jarName: { type: 'text', check: text(checkJarName) },
  javaOpts: { type: 'text', check: text(checkJavaOpts) },
  springProfile: { type: 'text', check: text(checkProfile) },
  healthPath: { type: 'path', check: path(L.healthPath) },
  tomcatRoot: { type: 'path', check: path(L.tomcatRoot) },
  catalinaBase: { type: 'path', check: path(L.catalinaBase) },
  tomcatUser: { type: 'text', check: text((v) => checkUser(L.tomcatUser, v)) },
  domain: { type: 'text', check: text(checkDomain) },
  tls: { type: 'flag' },
  certPath: { type: 'path', check: path(L.certPath) },
  keyPath: { type: 'path', check: path(L.keyPath) },
  httpRedirect: { type: 'flag' },
  maxBodySize: { type: 'text', check: text(checkMaxBodySize) },
  winNodeTool: { type: 'select', options: ['fnm', 'volta', 'nvm-windows'] },
};

export const PARAM_IDS = Object.keys(PARAM_DEFS) as ParamId[];

/** 入力の誤り（入力欄の ID と理由。format・port は message に検査の文が入る） */
export interface InputError {
  param: ParamId;
  kind: 'format' | 'port' | 'same' | 'layout';
  message?: string;
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
    if (def.type === 'select') {
      if (!def.options?.includes(String(value))) errors.push({ param: id, kind: 'format' });
    } else if (def.check) {
      const message = def.check(value as string | number);
      if (message)
        errors.push({ param: id, kind: def.type === 'number' ? 'port' : 'format', message });
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
  // CATALINA_BASE を本体のフォルダの中にしない（組み立ての関数と同じ検査）
  if (
    params.includes('catalinaBase') &&
    params.includes('tomcatRoot') &&
    !errors.some((e) => e.param === 'catalinaBase' || e.param === 'tomcatRoot')
  ) {
    const home = catalinaHome(input);
    const base = input.catalinaBase;
    if (base === home || base.startsWith(`${home}/`) || base === input.tomcatRoot) {
      errors.push({
        param: 'catalinaBase',
        kind: 'layout',
        message: err.catalinaBaseInsideRoot(base, home),
      });
    }
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

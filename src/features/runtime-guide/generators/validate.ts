// 設定ファイルの組み立ての入力の検査。DOM 非依存。
// 入力値は Nginx の conf・systemd のユニット・シェル（setenv.sh）・XML にそのまま入るため、
// 書き方を壊す文字（空白・引用符・; ・{ ・} ・$ ・改行・< ・& など）は「許す文字だけ」で検査して弾く（エスケープはしない）。
import type { GuideInput } from '../types';
import { err, label } from './strings';

const APP_NAME = /^[a-z][a-z0-9-]{0,31}$/;
const USER = /^[a-z_][a-z0-9_-]{0,31}$/;
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const PATH = /^(?:\/[A-Za-z0-9._-]+)+$/;
const JAR = /^[A-Za-z0-9._-]+\.jar$/;
const JAVA_OPT = /^-[A-Za-z0-9:+=._,/%-]+$/;
const PROFILE = /^[A-Za-z0-9_-]+(?:,[A-Za-z0-9_-]+)*$/;
const SIZE = /^[0-9]{1,6}[kKmMgG]?$/;
const TOMCAT_VERSION = /^(10\.1|11\.0)\.[0-9]{1,3}$/;

export function checkAppName(v: string): string | undefined {
  return APP_NAME.test(v) && !v.endsWith('-') ? undefined : err.appName(v);
}

export function checkUser(name: string, v: string): string | undefined {
  if (v === 'root') return err.rootUser(name);
  return USER.test(v) ? undefined : err.user(name, v);
}

export function checkPort(v: number): string | undefined {
  return Number.isInteger(v) && v >= 1024 && v <= 65535 ? undefined : err.port(v);
}

export function checkDomain(v: string): string | undefined {
  const ok = v.length <= 253 && v.split('.').every((l) => DOMAIN_LABEL.test(l));
  return ok ? undefined : err.domain(v);
}

/** 絶対パス（ルートそのもの・.. ・. の段・末尾の / は不可） */
export function checkPath(name: string, v: string): string | undefined {
  const ok = PATH.test(v) && v.split('/').every((s) => s !== '.' && s !== '..');
  return ok ? undefined : err.path(name, v);
}

export function checkJarName(v: string): string | undefined {
  return JAR.test(v) ? undefined : err.jarName(v);
}

/** JVM のオプションを空白で分けて返す（不正なら undefined）。空なら [] */
export function splitJavaOpts(v: string): string[] | undefined {
  if (/[\r\n]/.test(v)) return undefined;
  const opts = v.trim() ? v.trim().split(/[ \t]+/) : [];
  return opts.every((o) => JAVA_OPT.test(o)) ? opts : undefined;
}

export function checkJavaOpts(v: string): string | undefined {
  return splitJavaOpts(v) ? undefined : err.javaOpts(v);
}

export function checkProfile(v: string): string | undefined {
  return v === '' || PROFILE.test(v) ? undefined : err.profile(v);
}

export function checkMaxBodySize(v: string): string | undefined {
  return SIZE.test(v) ? undefined : err.maxBodySize(v);
}

/** Tomcat の版から「10.1」「11.0」を返す（不正なら undefined） */
export function tomcatMajor(v: string): '10.1' | '11.0' | undefined {
  const m = TOMCAT_VERSION.exec(v);
  return m ? (m[1] as '10.1' | '11.0') : undefined;
}

export function checkTomcatVersion(v: string): string | undefined {
  return tomcatMajor(v) ? undefined : err.tomcatVersion(v);
}

/** CATALINA_HOME（本体。<tomcatRoot>/current） */
export function catalinaHome(input: Pick<GuideInput, 'tomcatRoot'>): string {
  return `${input.tomcatRoot}/current`;
}

/** 外部 Tomcat の入力（本体の置き場所・CATALINA_BASE・ユーザー）の検査 */
export function checkTomcatLayout(input: GuideInput): string[] {
  const errors = collect(
    checkPath(label.tomcatRoot, input.tomcatRoot),
    checkPath(label.catalinaBase, input.catalinaBase),
    checkUser(label.tomcatUser, input.tomcatUser),
  );
  if (errors.length) return errors;
  const home = catalinaHome(input);
  const base = input.catalinaBase;
  if (base === home || base.startsWith(`${home}/`) || base === input.tomcatRoot) {
    errors.push(err.catalinaBaseInsideRoot(base, home));
  }
  return errors;
}

/** undefined を除いた誤りの一覧 */
export function collect(...errors: (string | undefined)[]): string[] {
  return errors.filter((e): e is string => !!e);
}

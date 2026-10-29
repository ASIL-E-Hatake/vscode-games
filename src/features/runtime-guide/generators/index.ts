// 設定ファイル（Nginx の conf・systemd のユニット・外部 Tomcat の server.xml の差分 / setenv.sh）を組み立てる純粋関数の入口。
// 手順のデータ（content/runtime-guide/*.yaml）の `file: { generator: '<id>' }` から呼ばれる。DOM 非依存。
// 各組み立ては nginx.ts・systemd.ts・tomcat.ts。入力の検査は validate.ts（不正な値は errors を返し、設定ファイルの書き方を壊さない）
import type { OutputFile } from '../../../core/fileOutput';
import type { GeneratorId, GuideInput } from '../types';
import { nginxConf } from './nginx';
import { systemdSpring, systemdTomcat } from './systemd';
import { tomcatServerXml, tomcatSetenv } from './tomcat';

/** 組み立ての結果。入力が不正なときは errors（画面に出す理由） */
export type GeneratorResult = OutputFile[] | { errors: string[] };

export type Generator = (input: GuideInput) => GeneratorResult;

export const GENERATORS: Record<GeneratorId, Generator> = {
  'nginx-conf': nginxConf,
  'systemd-spring': systemdSpring,
  'tomcat-setenv': tomcatSetenv,
  'tomcat-server-xml': tomcatServerXml,
  'systemd-tomcat': systemdTomcat,
};

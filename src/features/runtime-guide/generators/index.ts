// 設定ファイル（Nginx の conf・systemd のユニット・外部 Tomcat の server.xml の差分 / setenv.sh）を組み立てる純粋関数の入口。
// 手順のデータ（content/runtime-guide/*.yaml）の `file: { generator: '<id>' }` から呼ばれる。DOM 非依存。
// ※ 中身は別の担当が作る（この雛形は約束の形だけ）。
import type { OutputFile } from '../../../core/fileOutput';
import type { GeneratorId, GuideInput } from '../types';

/** 組み立ての結果。入力が不正なときは errors（画面に出す理由） */
export type GeneratorResult = OutputFile[] | { errors: string[] };

export type Generator = (input: GuideInput) => GeneratorResult;

const notImplemented: Generator = () => ({ errors: ['未実装'] });

export const GENERATORS: Record<GeneratorId, Generator> = {
  'nginx-conf': notImplemented,
  'systemd-spring': notImplemented,
  'tomcat-setenv': notImplemented,
  'tomcat-server-xml': notImplemented,
  'systemd-tomcat': notImplemented,
};

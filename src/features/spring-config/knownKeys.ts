// よく使うキーの一覧（content/spring-config/keys.yaml）の型と検査。DOM 非依存
import { toEnvName } from './env';

export const KNOWN_KEYS_CONTENT = 'spring-config';

export interface KnownKeysFile {
  version: 1;
  keys: string[];
}

/** Webview に渡すデータ */
export interface SpringConfigData {
  knownKeys: string[];
}

/** 同じ環境変数の名前になるキーが 2 つあると推測がぶれるため、L2 で検査する */
export function checkKnownKeysFile(data: unknown): string[] {
  const file = data as KnownKeysFile;
  const byName = new Map<string, string>();
  const errors: string[] = [];
  for (const key of file.keys ?? []) {
    const { name } = toEnvName(key);
    const other = byName.get(name);
    if (other) errors.push(`${other} と ${key} は同じ環境変数 ${name} になります`);
    byName.set(name, key);
  }
  return errors;
}

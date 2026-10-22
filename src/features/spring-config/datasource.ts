// DB 接続の雛形: spring.datasource.*・spring.jpa.* を properties / YAML / 環境変数で出す。DOM 非依存
import type { OutputFile } from '../../core/fileOutput';
import { envLines, ENV_FILES, toEnvName, type EnvFormat, type EnvVar } from './env';
import type { PropEntry } from './keyPath';
import { propertiesLines } from './properties';
import { strings } from './strings';
import { yamlLines } from './yamlWrite';

export type Database = 'postgresql' | 'mysql';
export type Target = 'compose' | 'local';

export interface DatasourceInput {
  db: Database;
  target: Target;
  host: string;
  /** 文字列のまま受け取る（入力欄の値。数字でなければ誤り） */
  port: string;
  database: string;
  username: string;
  envFormat: EnvFormat;
}

/** DB ごとの既定のポート */
export const DEFAULT_PORTS: Record<Database, string> = { postgresql: '5432', mysql: '3306' };
/** 接続先ごとの既定のホスト（compose の中からはサービス名） */
export const DEFAULT_HOSTS: Record<Target, string> = { compose: 'db', local: 'localhost' };

export const defaultDatasourceInput = (): DatasourceInput => ({
  db: 'postgresql',
  target: 'compose',
  host: DEFAULT_HOSTS.compose,
  port: DEFAULT_PORTS.postgresql,
  database: 'app',
  username: 'app',
  envFormat: 'compose',
});

/** 入力の誤り（無ければ空の配列） */
export function validateDatasource(input: DatasourceInput): string[] {
  const s = strings.datasource;
  const errors: string[] = [];
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(input.host.trim())) errors.push(s.hostError);
  const port = Number(input.port.trim());
  if (!/^\d+$/.test(input.port.trim()) || port < 1 || port > 65535) errors.push(s.portError);
  if (!/^[A-Za-z0-9_-]+$/.test(input.database.trim())) errors.push(s.databaseError);
  if (!/^[A-Za-z0-9_.-]+$/.test(input.username.trim())) errors.push(s.usernameError);
  return errors;
}

/** JDBC URL */
export function jdbcUrl(input: DatasourceInput): string {
  const base = `${input.host.trim()}:${input.port.trim()}/${input.database.trim()}`;
  return input.db === 'mysql'
    ? `jdbc:mysql://${base}?serverTimezone=Asia/Tokyo`
    : `jdbc:postgresql://${base}`;
}

const PASSWORD_KEY = 'spring.datasource.password';

/** 雛形の項目（各行の説明付き） */
export function datasourceEntries(input: DatasourceInput): PropEntry[] {
  const s = strings.datasource;
  const hostExplain = input.target === 'compose' ? s.hostCompose : s.hostLocal;
  return [
    {
      key: 'spring.datasource.url',
      value: jdbcUrl(input),
      explain: `${input.db === 'mysql' ? s.urlMysql : s.urlPostgres}。${hostExplain}`,
    },
    { key: 'spring.datasource.username', value: input.username.trim(), explain: s.username },
    { key: PASSWORD_KEY, value: '${DB_PASSWORD}', explain: s.password },
    { key: 'spring.jpa.hibernate.ddl-auto', value: 'validate', explain: s.ddlAuto },
    { key: 'spring.jpa.open-in-view', value: 'false', explain: s.openInView },
  ];
}

/** 環境変数の形（パスワードは compose なら ${DB_PASSWORD} で compose に置き換えさせ、ほかは空にする） */
export function datasourceEnv(entries: readonly PropEntry[]): EnvVar[] {
  return entries.map((e) => {
    const v: EnvVar = { name: toEnvName(e.key).name, value: e.value, explain: e.explain };
    if (e.key === PASSWORD_KEY) {
      v.explain = undefined;
      v.raw = { compose: '${DB_PASSWORD}', dotenv: '', bash: "''", powershell: "''" };
    }
    return v;
  });
}

/** 雛形の 3 ファイル（properties・YAML・環境変数）。入力に誤りがあれば errors */
export function buildDatasource(input: DatasourceInput): { files: OutputFile[]; errors: string[] } {
  const errors = validateDatasource(input);
  if (errors.length > 0) return { files: [], errors };
  const s = strings.datasource;
  const entries = datasourceEntries(input);
  const warnings = [
    s.warnings.driver,
    ...(input.db === 'mysql' ? [s.warnings.mysqlParams] : []),
    ...(input.target === 'compose' && /^(?:localhost|127\.0\.0\.1)$/.test(input.host.trim())
      ? [s.warnings.composeHost]
      : []),
  ];
  const env = datasourceEnv(entries);
  const passwordExplain = input.envFormat === 'compose' ? s.passwordCompose : s.passwordEmpty;
  const password = env.find((v) => v.raw);
  if (password) password.explain = passwordExplain;
  const docs = [{ entries }];
  return {
    errors: [],
    files: [
      {
        name: 'application.properties',
        language: 'properties',
        comment: '#',
        lines: propertiesLines(docs),
        warnings,
      },
      { name: 'application.yml', language: 'yaml', comment: '#', lines: yamlLines(docs).lines, warnings },
      { ...ENV_FILES[input.envFormat], comment: '#', lines: envLines(env, input.envFormat), warnings },
    ],
  };
}

// compose の組み立ての入力: 既定値と検査（誤りの一覧と、組み立てに使う形への整理）。DOM 非依存
import { strings } from './strings';
import type {
  AppFramework,
  ComposeInput,
  ComposeServicesFile,
  ServiceDef,
  ServiceInput,
} from './types';
import { invalidDotenvValue } from './yamlText';

/** パスワードが空のときに .env に入れる仮の値 */
export const PLACEHOLDER_PASSWORD = 'change-me';

/** アプリの種類ごとの既定のポート */
export const APP_DEFAULT_PORT: Record<AppFramework, string> = { spring: '8080', node: '3000' };

/** 部品を選んだときの入力の初期値 */
export function serviceDefaults(def: ServiceDef): ServiceInput {
  const input: ServiceInput = {
    id: def.id,
    ports: Object.fromEntries(def.ports.map((p) => [p.id, String(p.host)])),
  };
  if (def.fields?.includes('database')) input.database = def.defaults?.database ?? 'app';
  if (def.fields?.includes('user')) input.user = def.defaults?.user ?? 'app';
  if (def.fields?.includes('password')) input.password = '';
  return input;
}

/** 画面を最初に開いたときの入力（Spring Boot のアプリ + PostgreSQL） */
export function defaultInput(file: ComposeServicesFile): ComposeInput {
  const postgres = file.services.find((s) => s.id === 'postgres') ?? file.services[0];
  return {
    projectName: 'myapp',
    app: {
      mode: 'build',
      image: '',
      framework: 'spring',
      hostPort: APP_DEFAULT_PORT.spring,
      containerPort: APP_DEFAULT_PORT.spring,
      profile: '',
      extraEnv: '',
    },
    services: postgres ? [serviceDefaults(postgres)] : [],
    persist: true,
    initSqlDir: '',
  };
}

/** 保存する形（パスワードは保存しない） */
export function inputForStorage(input: ComposeInput): ComposeInput {
  return {
    ...input,
    app: { ...input.app },
    services: input.services.map(({ password: _password, ...rest }) => ({
      ...rest,
      ports: { ...rest.ports },
    })),
  };
}

/** 保存していた入力を、今のデータに合わせて読み直す（知らない部品・欠けた項目は既定値で補う） */
export function restoreInput(saved: unknown, file: ComposeServicesFile): ComposeInput {
  const base = defaultInput(file);
  if (!saved || typeof saved !== 'object') return base;
  const s = saved as Partial<ComposeInput>;
  const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
  const app = (s.app ?? {}) as Partial<ComposeInput['app']>;
  const services = Array.isArray(s.services)
    ? s.services.flatMap((raw: Partial<ServiceInput>) => {
        const def = file.services.find((d) => d.id === raw?.id);
        if (!def) return [];
        const init = serviceDefaults(def);
        const ports = { ...init.ports };
        for (const p of def.ports) ports[p.id] = str(raw.ports?.[p.id], ports[p.id]!);
        return [
          {
            ...init,
            ports,
            ...(init.database !== undefined ? { database: str(raw.database, init.database) } : {}),
            ...(init.user !== undefined ? { user: str(raw.user, init.user) } : {}),
          },
        ];
      })
    : base.services;
  return {
    projectName: str(s.projectName, base.projectName),
    app: {
      mode: app.mode === 'none' || app.mode === 'image' || app.mode === 'build' ? app.mode : 'build',
      image: str(app.image, ''),
      framework: app.framework === 'node' ? 'node' : 'spring',
      hostPort: str(app.hostPort, base.app.hostPort),
      containerPort: str(app.containerPort, base.app.containerPort),
      profile: str(app.profile, ''),
      extraEnv: str(app.extraEnv, ''),
    },
    services,
    persist: typeof s.persist === 'boolean' ? s.persist : true,
    initSqlDir: str(s.initSqlDir, ''),
  };
}

// ---- 検査 ----

const PROJECT_NAME = /^[a-z0-9][a-z0-9_-]*$/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const IMAGE_NAME =
  /^([a-z0-9.-]+(:\d+)?\/)?[a-z0-9]+([._/-][a-z0-9]+)*(:[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})?(@sha256:[a-f0-9]{64})?$/;

export function isPort(value: string): boolean {
  if (!/^\d{1,5}$/.test(value)) return false;
  const n = Number(value);
  return n >= 1 && n <= 65535;
}

/** 選んだ部品（データの順）と、その入力 */
export interface ChosenService {
  def: ServiceDef;
  /** ポートの id → ホスト側のポート（空なら公開しない） */
  hostPorts: Record<string, string>;
  database: string;
  user: string;
  /** .env に入れるパスワード（空なら仮の値） */
  password: string;
  passwordDefaulted: boolean;
}

export interface CheckedInput {
  errors: string[];
  services: ChosenService[];
  /** 追加の環境変数（名前・値。同じ名前は後のほうが勝つ） */
  extraEnv: [string, string][];
}

/** 「名前=値」の行を読む。空行と # で始まる行は飛ばす */
export function parseExtraEnv(text: string): { env: [string, string][]; errors: string[] } {
  const env = new Map<string, string>();
  const errors: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    const name = eq > 0 ? line.slice(0, eq).trim() : '';
    if (!ENV_NAME.test(name)) {
      errors.push(strings.errors.extraEnv(line));
      continue;
    }
    env.delete(name);
    env.set(name, line.slice(eq + 1).trim());
  }
  return { env: [...env], errors };
}

export function checkInput(input: ComposeInput, file: ComposeServicesFile): CheckedInput {
  const e = strings.errors;
  const errors: string[] = [];
  const selected = new Map(input.services.map((s) => [s.id, s]));
  const defs = file.services.filter((d) => selected.has(d.id));

  if (input.app.mode === 'none' && defs.length === 0) errors.push(e.nothing);
  if (!PROJECT_NAME.test(input.projectName)) errors.push(e.projectName);

  const app = input.app;
  if (app.mode === 'image' && !IMAGE_NAME.test(app.image.trim())) errors.push(e.appImage);
  if (app.mode !== 'none') {
    if (app.hostPort.trim() !== '' && !isPort(app.hostPort.trim())) {
      errors.push(e.port(`${strings.appHeading}の${strings.appHostPortLabel}`, app.hostPort));
    }
    if (!isPort(app.containerPort.trim())) {
      errors.push(
        e.port(`${strings.appHeading}の${strings.appContainerPortLabel}`, app.containerPort),
      );
    }
  }
  const extra = app.mode === 'none' ? { env: [], errors: [] } : parseExtraEnv(app.extraEnv);
  errors.push(...extra.errors);

  const services = defs.map((def): ChosenService => {
    const raw = selected.get(def.id)!;
    const hostPorts: Record<string, string> = {};
    for (const port of def.ports) {
      const value = (raw.ports[port.id] ?? String(port.host)).trim();
      if (value !== '' && !isPort(value)) errors.push(e.port(`${def.name}の${port.label}`, value));
      hostPorts[port.id] = value;
    }
    const fields = def.fields ?? [];
    const database = (raw.database ?? def.defaults?.database ?? '').trim();
    const user = (raw.user ?? def.defaults?.user ?? '').trim();
    if (fields.includes('database') && !IDENTIFIER.test(database)) {
      errors.push(e.identifier(`${def.name}の${strings.databaseLabel}`, database));
    }
    if (fields.includes('user')) {
      if (!IDENTIFIER.test(user)) {
        errors.push(e.identifier(`${def.name}の${strings.userLabel}`, user));
      } else if (def.reservedUsers?.some((r) => r.toLowerCase() === user.toLowerCase())) {
        errors.push(e.reservedUser(def.name, user));
      }
    }
    const typed = raw.password ?? '';
    if (fields.includes('password') && invalidDotenvValue(typed)) errors.push(e.password(def.name));
    return {
      def,
      hostPorts,
      database,
      user,
      password: typed === '' ? PLACEHOLDER_PASSWORD : typed,
      passwordDefaulted: typed === '',
    };
  });

  if (input.initSqlDir.trim() !== '' && !/^[^\s'":]+$/.test(input.initSqlDir.trim())) {
    errors.push(e.initSqlDir);
  }
  return { errors, services, extraEnv: extra.env };
}

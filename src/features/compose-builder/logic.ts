// compose の組み立て（docs/10-container-tools.md 4.2）。入力 → compose.yaml・.env・.gitignore に足す行。DOM 非依存
import { imageRef } from '../../core/containerImages';
import type { FileLine, OutputFile } from '../../core/fileOutput';
import { checkInput, type ChosenService } from './input';
import { strings } from './strings';
import type { ComposeBuilderData, ComposeInput, Connection, EnvVarTemplate } from './types';
import {
  dotenvValue,
  fillTemplate,
  needsUrlEncoding,
  templateNames,
  yamlFlowList,
  yamlScalar,
} from './yamlText';

export type ComposeResult =
  { ok: true; files: OutputFile[]; connections: Connection[] } | { ok: false; errors: string[] };

/** healthcheck の間隔など（説明は strings.explain.healthTiming） */
const HEALTH_TIMING = ['interval: 5s', 'timeout: 5s', 'retries: 10', 'start_period: 30s'];

/** アプリのサービス名 */
export const APP_SERVICE = 'app';

/** 部品の {…} に入れる値。password は compose の中では ${<passwordEnv>} */
function templateValues(
  chosen: ChosenService,
  databaseService: string | undefined,
  password: string,
): Record<string, string> {
  const values: Record<string, string> = {
    service: chosen.def.id,
    database: chosen.database,
    user: chosen.user,
    password,
  };
  if (databaseService) values.databaseService = databaseService;
  chosen.def.ports.forEach((p, i) => {
    const host = chosen.hostPorts[p.id] ?? '';
    values[`port.${p.id}`] = String(p.container);
    values[`hostPort.${p.id}`] = host;
    if (i === 0) {
      values.port = String(p.container);
      values.hostPort = host;
    }
  });
  return values;
}

/** テンプレートの {…} がすべて埋まるか（DB を選んでいないときの {databaseService} などを飛ばす） */
function fillable(template: string, values: Record<string, string>): boolean {
  return templateNames(template).every((n) => values[n] !== undefined && values[n] !== '');
}

/** ずらしたポートの例（5432 → 15432、それ以上は +1） */
function shiftedPort(port: string): string {
  const n = Number(port);
  return String(n < 10000 ? n + 10000 : n + 1);
}

/** 初期化 SQL のフォルダ（DB が 2 つ以上なら DB ごとの下のフォルダ） */
function initDirFor(input: ComposeInput, chosen: ChosenService, dbCount: number): string {
  const dir = input.initSqlDir.trim().replace(/\/+$/, '');
  return dbCount > 1 ? `${dir}/${chosen.def.id}` : dir;
}

export function buildCompose(input: ComposeInput, data: ComposeBuilderData): ComposeResult {
  const checked = checkInput(input, data.services);
  if (checked.errors.length > 0) return { ok: false, errors: checked.errors };
  const ex = strings.explain;
  const w = strings.warnings;
  const services = checked.services;
  const app = input.app;
  const hasApp = app.mode !== 'none';
  const databases = services.filter((s) => s.def.kind === 'database');
  const databaseService = databases[0]?.def.id;
  const warnings: string[] = [];
  const lines: FileLine[] = [];
  const add = (text: string, explain?: string) =>
    lines.push(explain === undefined ? { text } : { text, explain });
  /** ports の 1 行（既定は 127.0.0.1 だけに公開。LAN に公開するときだけ全インターフェース） */
  const bind = (host: string, container: string | number) =>
    input.lan ? `${host}:${container}` : `127.0.0.1:${host}:${container}`;
  const compose = (s: ChosenService) =>
    templateValues(s, databaseService, s.def.passwordEnv ? `\${${s.def.passwordEnv}}` : '');

  // ---- ホスト側のポートの重なり・ぶつかりやすいポート ----
  const published: { port: string; owner: string }[] = [];
  if (hasApp && app.hostPort.trim() !== '') {
    published.push({ port: app.hostPort.trim(), owner: `${strings.appHeading}（${APP_SERVICE}）` });
  }
  for (const s of services) {
    for (const p of s.def.ports) {
      const port = s.hostPorts[p.id] ?? '';
      if (port !== '') published.push({ port, owner: `${s.def.name}（${p.label}）` });
    }
  }
  for (const port of new Set(published.map((p) => p.port))) {
    const owners = published.filter((p) => p.port === port).map((p) => p.owner);
    if (owners.length > 1) warnings.push(w.duplicatePort(port, owners));
  }
  for (const { port, owner } of published) {
    if (data.services.crowdedPorts.includes(Number(port))) {
      warnings.push(w.crowdedPort(port, owner, bind(shiftedPort(port), port)));
    }
  }
  if (input.lan && published.length > 0) {
    warnings.push(w.lan);
    for (const s of services) {
      const exposed = s.def.ports.some((p) => (s.hostPorts[p.id] ?? '') !== '');
      if (exposed && s.def.lanRisk) warnings.push(w.lanRisk(s.def.name, s.def.lanRisk));
      if (exposed && s.passwordDefaulted && s.def.passwordEnv) {
        warnings.push(w.defaultPasswordLan(s.def.name, s.def.passwordEnv));
      }
    }
  }
  if (services.some((s) => s.def.waitFor === 'database') && databases.length === 0) {
    for (const s of services.filter((x) => x.def.waitFor === 'database')) {
      warnings.push(w.adminerWithoutDb(s.def.name));
    }
  }

  add(`name: ${yamlScalar(input.projectName)}`, ex.name(input.projectName));
  add('services:', ex.services);

  // ---- アプリ ----
  if (hasApp) {
    add(`  ${APP_SERVICE}:`, ex.app);
    if (app.mode === 'build') add('    build: .', `${ex.build}。${strings.dockerfileHint}`);
    else add(`    image: ${yamlScalar(app.image.trim())}`, ex.image);
    if (app.hostPort.trim() !== '') {
      add('    ports:');
      const host = app.hostPort.trim();
      const container = app.containerPort.trim();
      add(
        `      - ${JSON.stringify(bind(host, container))}`,
        `${ex.appPorts(host, container)}。${input.lan ? ex.portsLan : ex.portsLocal}`,
      );
    }

    // 環境変数（同じ名前は最初のものを使う。追加の環境変数は上書きする）
    const env: { name: string; value: string; explain?: string; owner: string }[] = [];
    if (app.framework === 'spring' && app.profile.trim() !== '') {
      env.push({
        name: 'SPRING_PROFILES_ACTIVE',
        value: app.profile.trim(),
        explain: ex.profile,
        owner: strings.profileLabel,
      });
    }
    for (const s of services) {
      const values = compose(s);
      const templates: EnvVarTemplate[] = s.def.connect?.[app.framework] ?? [];
      for (const t of templates) {
        if (!fillable(t.value, values)) continue;
        const kept = env.find((x) => x.name === t.name);
        if (kept) {
          warnings.push(w.duplicateEnv(t.name, kept.owner));
          continue;
        }
        env.push({
          name: t.name,
          value: fillTemplate(t.value, values),
          explain: t.explain && fillTemplate(t.explain, values),
          owner: s.def.name,
        });
        if (
          app.framework === 'node' &&
          templateNames(t.value).includes('password') &&
          needsUrlEncoding(s.password)
        ) {
          warnings.push(w.passwordInUrl(s.def.name));
        }
      }
    }
    for (const [name, value] of checked.extraEnv) {
      const item = { name, value, explain: ex.extraEnv, owner: ex.extraEnv };
      const i = env.findIndex((x) => x.name === name);
      if (i >= 0) env[i] = item;
      else env.push(item);
    }
    if (env.length > 0) {
      add('    environment:');
      for (const e of env) add(`      ${e.name}: ${yamlScalar(e.value)}`, e.explain);
    }
    // 道具（Adminer など）はアプリから使わないので待たない
    const waits = services.filter((s) => s.def.kind !== 'tool');
    if (waits.length > 0) {
      add('    depends_on:');
      for (const s of waits) {
        add(
          `      ${s.def.id}:\n        condition: ${s.def.healthcheck ? 'service_healthy' : 'service_started'}`,
          s.def.healthcheck ? ex.dependsOn : ex.dependsOnStarted,
        );
      }
    }
  }

  // ---- 部品 ----
  const volumes: string[] = [];
  for (const s of services) {
    const def = s.def;
    const values = compose(s);
    const ref = imageRef(data.images, def.image) ?? def.image;
    if (hasApp || s !== services[0]) add('');
    add(`  ${def.id}:`, def.explain);
    add(`    image: ${yamlScalar(ref)}`, ex.image2(ref));
    if (def.command) add(`    command: ${yamlFlowList(def.command.args)}`, def.command.explain);
    const ports = def.ports.filter((p) => (s.hostPorts[p.id] ?? '') !== '');
    if (ports.length > 0) {
      add('    ports:');
      for (const p of ports) {
        const host = s.hostPorts[p.id]!;
        const scope = input.lan ? ex.portsLan : ex.portsLocal;
        const explain = [p.label, ex.ports(host, p.container), p.explain, scope].filter(Boolean);
        add(`      - ${JSON.stringify(bind(host, p.container))}`, explain.join('。'));
      }
    }
    const env = (def.environment ?? []).filter((t) => fillable(t.value, values));
    if (env.length > 0) {
      add('    environment:', ex.environment);
      for (const t of env) {
        add(
          `      ${t.name}: ${yamlScalar(fillTemplate(t.value, values))}`,
          t.explain && fillTemplate(t.explain, values),
        );
      }
    }
    const mounts: FileLine[] = [];
    if (input.persist && def.volume) {
      const volume = `${def.id}-data`;
      volumes.push(volume);
      mounts.push({
        text: `      - ${yamlScalar(`${volume}:${def.volume.target}`)}`,
        explain: ex.volumeData(volume),
      });
    }
    if (input.initSqlDir.trim() !== '' && def.initDir) {
      const dir = initDirFor(input, s, databases.filter((d) => d.def.initDir).length);
      mounts.push({
        text: `      - ${yamlScalar(`${dir}:${def.initDir}:ro`)}`,
        explain: ex.volumeInit(dir),
      });
    }
    if (mounts.length > 0) {
      add('    volumes:');
      lines.push(...mounts);
    }
    if (def.healthcheck) {
      add('    healthcheck:');
      add(
        `      test: ${yamlFlowList(def.healthcheck.test.map((t) => fillTemplate(t, values)))}`,
        def.healthcheck.explain,
      );
      add(HEALTH_TIMING.map((t) => `      ${t}`).join('\n'), ex.healthTiming);
    }
    if (def.waitFor) {
      const targets = services.filter((x) => x.def.kind === def.waitFor);
      if (targets.length > 0) {
        add('    depends_on:');
        for (const t of targets) {
          add(
            `      ${t.def.id}:\n        condition: ${t.def.healthcheck ? 'service_healthy' : 'service_started'}`,
            ex.serviceDependsOn,
          );
        }
      }
    }
  }
  if (volumes.length > 0) {
    add('');
    add('volumes:', ex.volumes);
    for (const v of volumes) add(`  ${v}:`, ex.volume(v));
  }

  const files: OutputFile[] = [
    { name: 'compose.yaml', language: 'yaml', comment: '#', lines, warnings },
  ];

  // ---- .env と .gitignore ----
  const secrets = services.filter((s) => s.def.passwordEnv);
  if (secrets.length > 0) {
    const envLines: FileLine[] = [];
    const seen = new Set<string>();
    for (const s of secrets) {
      const name = s.def.passwordEnv!;
      if (seen.has(name)) continue;
      seen.add(name);
      const explain = ex.envPassword(s.def.name);
      envLines.push({
        text: `${name}=${dotenvValue(s.password)}`,
        explain: envLines.length === 0 ? `${ex.envFile}。${explain}` : explain,
      });
    }
    files.push({
      name: '.env',
      language: 'dotenv',
      comment: '#',
      lines: envLines,
      warnings: [
        w.envNotInGit,
        ...secrets
          .filter((s) => s.passwordDefaulted)
          .map((s) => w.defaultPassword(s.def.passwordEnv!)),
      ],
    });
    files.push({
      name: '.gitignore',
      language: 'ignore',
      comment: '#',
      lines: [{ text: '.env', explain: ex.gitignore }],
    });
  }

  return { ok: true, files, connections: connections(input, services, databaseService) };
}

/** 手元（IDE・ブラウザ）から繋ぐときの情報 */
function connections(
  input: ComposeInput,
  services: ChosenService[],
  databaseService: string | undefined,
): Connection[] {
  const framework = input.app.mode === 'none' ? undefined : input.app.framework;
  return services.flatMap((s): Connection[] => {
    const hostItems = (s.def.connect?.host ?? []).filter(
      (h) => !h.for || !framework || h.for === framework,
    );
    if (hostItems.length === 0) return [];
    const values = templateValues(s, databaseService, '');
    const items = hostItems.flatMap((h) => {
      const names = templateNames(h.value);
      const hostPort = names.find((n) => n.startsWith('hostPort'));
      if (hostPort !== undefined && values[hostPort] === '') {
        return [{ label: h.label, value: strings.notPublished }];
      }
      if (!fillable(h.value, values)) return [];
      return [{ label: h.label, value: fillTemplate(h.value, values) }];
    });
    if (s.def.passwordEnv) {
      items.push({
        label: strings.passwordItem,
        value: strings.passwordFromEnv(s.def.passwordEnv),
      });
    }
    return [{ service: s.def.id, name: s.def.name, items }];
  });
}

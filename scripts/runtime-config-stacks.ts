// L2（実行環境の設定）: 組み立てた設定で Tomcat・Spring Boot を Nginx の後ろに並べて動かし、応答を確かめる（runtime-config-e2e.ts から使う）。
// Nginx はアプリと同じネットワーク（network_mode: service:app）に置く。サーバーの上で同じマシンに並べるのと同じく、
// アプリは 127.0.0.1 だけで待ち受け、Nginx は 127.0.0.1:<ポート> へ転送する。
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { temurinHome } from '../src/features/runtime-guide/types';
import { sampleDockerFiles } from './container-dockerfiles';
import { composeData } from './compose-examples';
import { applyServerXml, docker, httpGet, tail, waitFor } from './runtime-config-docker';
import { generate, generateText } from './runtime-configs';
import { fileText } from '../src/core/fileOutput';

export interface Check {
  name: string;
  run: () => Promise<string | undefined>;
}

const DOMAIN = 'app.example.com';
const HTTP_PORT = 18481;
const HTTPS_PORT = 18443;
const HTTPS = `https://localhost:${HTTPS_PORT}`;
const START_TIMEOUT_MS = 240_000;

/** Nginx のイメージ（組み立てた conf と、conf に書かれたパスの自己署名の証明書） */
function nginxDir(dir: string, conf: string): void {
  const cert = /ssl_certificate (\S+);/.exec(conf)![1]!;
  const key = /ssl_certificate_key (\S+);/.exec(conf)![1]!;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'app.conf'), conf);
  writeFileSync(
    join(dir, 'Dockerfile'),
    [
      'FROM nginx:stable',
      `RUN rm -f /etc/nginx/conf.d/default.conf && mkdir -p "$(dirname ${cert})" "$(dirname ${key})" \\`,
      `  && openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=${DOMAIN} -keyout ${key} -out ${cert} 2>/dev/null`,
      'COPY app.conf /etc/nginx/conf.d/app.conf',
      '',
    ].join('\n'),
  );
}

const COMPOSE = [
  'services:',
  '  app:',
  '    build: ./app',
  // Nginx の listen [::]:80 のため IPv6 を使えるようにする（Nginx はこのコンテナのネットワークを共有する）
  '    sysctls:',
  "      net.ipv6.conf.all.disable_ipv6: '0'",
  '    ports:',
  `      - '${HTTP_PORT}:80'`,
  `      - '${HTTPS_PORT}:443'`,
  '  nginx:',
  '    build: ./nginx',
  "    network_mode: 'service:app'",
  '    depends_on: [app]',
  '',
].join('\n');

/** 準備 → 確かめる → 片付け の検査を、1 つの compose のプロジェクトで並べる */
function stack(
  label: string,
  project: string,
  prepare: (dir: string) => void,
  ready: string,
  checks: {
    name: string;
    run: (exec: (cmd: string) => ReturnType<typeof docker>) => Promise<string | undefined>;
  }[],
): Check[] {
  let dir = '';
  const compose = (args: string[], timeoutMs?: number) =>
    docker(['compose', '-p', project, ...args], dir, timeoutMs);
  const exec = (cmd: string) => compose(['exec', '-T', 'app', 'bash', '-c', cmd], 60_000);
  let broken: string | undefined;
  const logs = () => tail(compose(['logs', '--no-color'], 60_000).output, 80);
  return [
    {
      name: `${label} / 組み立てた設定で起動し、Nginx 経由で応答する`,
      run: async () => {
        dir = mkdtempSync(join(tmpdir(), 'runtime-stack-'));
        prepare(dir);
        writeFileSync(join(dir, 'compose.yaml'), COMPOSE);
        const up = compose(['up', '--build', '--detach'], 900_000);
        broken = up.ok
          ? await waitFor(`${HTTPS}/`, DOMAIN, ready, START_TIMEOUT_MS)
          : `docker compose up に失敗しました\n${tail(up.output)}`;
        return broken && `${broken}\n--- logs ---\n${logs()}`;
      },
    },
    ...checks.map((c) => ({
      name: `${label} / ${c.name}`,
      run: async () => (broken ? '起動できなかったため確かめられません' : c.run(exec)),
    })),
    {
      name: `${label} / 片付け`,
      run: async () => {
        if (!dir) return undefined;
        const down = compose(['down', '--volumes', '--remove-orphans', '--rmi', 'local'], 180_000);
        rmSync(dir, { recursive: true, force: true });
        return down.ok ? undefined : tail(down.output);
      },
    },
  ];
}

const expectAll = (problems: (string | false)[]) =>
  problems.filter(Boolean).join('\n') || undefined;

/** Nginx 経由の https の応答で、アプリに https・利用者の IP が見えているか（共通） */
async function forwardedCheck(marker: string): Promise<string | undefined> {
  const res = await httpGet(`${HTTPS}/`, DOMAIN);
  const ip = /remoteAddr=(\S*)/.exec(res.body)?.[1] ?? '';
  return expectAll([
    res.status !== 200 && `状態が ${res.status} です`,
    !res.body.includes(marker) && `本文に ${marker} がありません: ${res.body}`,
    !res.body.includes('scheme=https') && `アプリから https に見えていません: ${res.body}`,
    !res.body.includes('secure=true') &&
      `アプリから isSecure() が true になっていません: ${res.body}`,
    !res.body.includes(`url=https://${DOMAIN}/`) &&
      `アプリが作る URL が https://${DOMAIN}/ になっていません: ${res.body}`,
    (!ip || ip === '127.0.0.1' || ip === '0:0:0:0:0:0:0:1') &&
      `利用者の IP ではなく Nginx の IP（${ip}）が見えています`,
    res.headers.server !== 'nginx' &&
      `Server ヘッダーに版が出ています（${String(res.headers.server)}）`,
    res.headers['x-content-type-options'] !== 'nosniff' && 'X-Content-Type-Options がありません',
    !res.headers['strict-transport-security'] && 'Strict-Transport-Security がありません',
    !res.headers['referrer-policy'] && 'Referrer-Policy がありません',
  ]);
}

const redirectCheck = {
  name: 'HTTP は HTTPS へ転送される（ドメインは固定）',
  run: async () => {
    const res = await httpGet(`http://localhost:${HTTP_PORT}/a?b=1`, 'evil.example.com');
    const res2 = await httpGet(`http://localhost:${HTTP_PORT}/a?b=1`, DOMAIN);
    return expectAll([
      res2.status !== 301 && `状態が ${res2.status} です`,
      res2.headers.location !== `https://${DOMAIN}/a?b=1` &&
        `転送先が ${String(res2.headers.location)} です`,
      res.status === 301 &&
        res.headers.location !== `https://${DOMAIN}/a?b=1` &&
        `Host を変えると転送先が変わります（${String(res.headers.location)}）`,
    ]);
  },
};

/** 公式の Tomcat（10.1 / 11）に、systemd のユニットと同じ配置・setenv.sh・server.xml の変更を当てる */
export function tomcatScenario(major: '10.1' | '11.0'): Check[] {
  const image = `tomcat:${major}-jdk21`;
  const input = { tomcatVersion: major === '10.1' ? '10.1.48' : '11.0.13' };
  const unit = generateText('systemd-tomcat', input);
  const env = [...unit.matchAll(/^Environment=(\w+)=(\S+)$/gm)].map((m) => `${m[1]}=${m[2]}`);
  const execStart = /^ExecStart=(.+)$/m.exec(unit)![1]!.split(' ');
  const user = /^User=(\S+)$/m.exec(unit)![1]!;
  const home = /CATALINA_HOME=(\S+)/.exec(unit)![1]!;
  const base = /CATALINA_BASE=(\S+)/.exec(unit)![1]!;
  const prepare = (dir: string) => {
    const app = join(dir, 'app');
    mkdirSync(app, { recursive: true });
    cpSync(join('tests', 'fixtures', 'runtime', 'hello-war'), join(app, 'hello-war'), {
      recursive: true,
    });
    const stock = docker(['run', '--rm', image, 'cat', 'conf/server.xml'], undefined, 300_000);
    if (!stock.ok) throw new Error(`元の server.xml を取り出せません\n${tail(stock.output)}`);
    writeFileSync(
      join(app, 'server.xml'),
      applyServerXml(stock.output, generateText('tomcat-server-xml', input)),
    );
    writeFileSync(join(app, 'setenv.sh'), generateText('tomcat-setenv', input));
    const dirs = ['logs', 'temp', 'work', 'webapps'].map((d) => `${base}/${d}`).join(' ');
    writeFileSync(
      join(app, 'Dockerfile'),
      [
        `FROM ${image}`,
        // サーバーと同じ配置: 本体は <tomcatRoot>/current（リンク）、設定とアプリは CATALINA_BASE、Java は Temurin の RPM と同じ場所
        `RUN useradd --system --no-create-home --shell /usr/sbin/nologin ${user} \\`,
        `  && mkdir -p "$(dirname ${home})" /usr/lib/jvm ${base}/bin ${dirs} \\`,
        `  && ln -s /usr/local/tomcat ${home} && ln -s "$JAVA_HOME" ${temurinHome('21')} \\`,
        `  && cp -r /usr/local/tomcat/conf ${base}/conf`,
        `COPY setenv.sh ${base}/bin/setenv.sh`,
        `COPY server.xml ${base}/conf/server.xml`,
        'COPY hello-war/ /tmp/hello-war/',
        `RUN cd /tmp/hello-war && jar cf ${base}/webapps/ROOT.war . \\`,
        `  && chown -R root:${user} ${base} && chmod -R g+rX,o-rwx ${base} && chown -R ${user}:${user} ${dirs}`,
        `ENV ${env.join(' ')}`,
        `USER ${user}`,
        `CMD ${JSON.stringify(execStart)}`,
        '',
      ].join('\n'),
    );
    nginxDir(join(dir, 'nginx'), generateText('nginx-conf'));
  };
  const project = `hg-rc-tomcat${major.replace('.', '')}`;
  return stack(`Tomcat ${major}`, project, prepare, 'hello-runtime', [
    {
      name: 'RemoteIpValve で https・利用者の IP が見える・セキュリティヘッダー',
      run: () => forwardedCheck('hello-runtime'),
    },
    redirectCheck,
    {
      name: 'エラーページに版が出ない・既定のアプリが無い',
      run: async () => {
        const problems: (string | false)[] = [];
        for (const path of ['/no-such-page', '/examples/', '/manager/html', '/docs/']) {
          const res = await httpGet(`${HTTPS}${path}`, DOMAIN);
          problems.push(res.status !== 404 && `${path} の状態が ${res.status} です`);
          problems.push(
            /Apache Tomcat|Tomcat\/\d/.test(res.body) &&
              `${path} のエラーページに Tomcat の版が出ています`,
          );
        }
        return expectAll(problems);
      },
    },
    {
      name: 'シャットダウンポートが閉じ、コネクタは 127.0.0.1 だけで待ち受ける',
      run: async (exec) => {
        const open = (host: string, port: number) => exec(`exec 3<>/dev/tcp/${host}/${port}`).ok;
        const ip = exec('hostname -i').output.trim().split(/\s+/)[0] ?? '';
        return expectAll([
          open('127.0.0.1', 8005) && 'シャットダウンポート 8005 が開いています',
          !open('127.0.0.1', 8080) && '127.0.0.1:8080 に繋がりません',
          (!ip || open(ip, 8080)) &&
            `コンテナの IP（${ip}）の 8080 に繋がります（127.0.0.1 だけのはず）`,
        ]);
      },
    },
    {
      name: 'アクセスログに利用者の IP が記録される',
      run: async (exec) => {
        // AccessLogValve は書き込みをまとめて行う（既定で buffered）ため、ファイルに出るまで待つ
        let log = '';
        let lines: string[] = [];
        for (const until = Date.now() + 30_000; !lines.length && Date.now() < until;) {
          await new Promise((r) => setTimeout(r, 2000));
          log = exec(`ls -l ${base}/logs; cat ${base}/logs/localhost_access_log.*.txt`).output;
          lines = log.split('\n').filter((l) => l.includes('"GET / '));
        }
        if (!lines.length) return `アクセスログに GET / がありません\n${tail(log)}`;
        return lines.some((l) => l.startsWith('127.0.0.1 '))
          ? `Nginx の IP が記録されています\n${tail(log)}`
          : undefined;
      },
    },
    ...(major === '10.1'
      ? [
          {
            name: '（検査の確認）元のままの Tomcat はエラーページに版を出す',
            run: async () => {
              const name = `${project}-stock`;
              const run = docker(
                ['run', '-d', '--rm', '--name', name, '-p', '18490:8080', image],
                undefined,
                300_000,
              );
              try {
                if (!run.ok) return tail(run.output);
                const until = Date.now() + 120_000;
                while (Date.now() < until) {
                  const res = await httpGet(
                    'http://localhost:18490/no-such-page',
                    'localhost',
                  ).catch(() => undefined);
                  if (res?.status === 404) {
                    return /Apache Tomcat\/\d/.test(res.body)
                      ? undefined
                      : '元のままでも版が出ません（検査が働いていません）';
                  }
                  await new Promise((r) => setTimeout(r, 2000));
                }
                return '元のままの Tomcat が起動しません';
              } finally {
                docker(['rm', '-f', name], undefined, 60_000);
              }
            },
          },
        ]
      : []),
  ]);
}

/** Spring Boot（組み込み Tomcat）を、環境変数ファイルの値とユニットの ExecStart と同じ起動のしかたで動かす */
export function springScenario(): Check[] {
  const prepare = (dir: string) => {
    const app = join(dir, 'app');
    cpSync(join('tests', 'fixtures', 'runtime', 'spring-web'), app, { recursive: true });
    for (const [name, text] of Object.entries(
      sampleDockerFiles('java-maven', composeData().images),
    )) {
      writeFileSync(join(app, name), text);
    }
    const [unitFile, envFile] = generate('systemd-spring');
    const unit = fileText(unitFile!);
    // ExecStart の java と jar を、イメージの中の場所に読み替える（$JAVA_OPTS は環境変数ファイルの値を空白で区切って渡す）
    // compose は $ を自分の変数として読むので $$ にする
    const execStart = /^ExecStart=\S+ (.+) -jar \S+$/m.exec(unit)![1]!.replace(/\$/g, '$$$$');
    writeFileSync(join(dir, 'app.env'), fileText(envFile!));
    nginxDir(join(dir, 'nginx'), generateText('nginx-conf'));
    writeFileSync(
      join(dir, 'compose.override.yaml'),
      [
        'services:',
        '  app:',
        '    env_file: ./app.env',
        `    entrypoint: ['sh', '-c', 'exec java ${execStart} -jar /app/app.jar']`,
        '',
      ].join('\n'),
    );
  };
  return stack('Spring Boot（組み込み Tomcat）', 'hg-rc-spring', prepare, 'hello-spring', [
    {
      name: 'forward-headers-strategy で https・利用者の IP が見える・セキュリティヘッダー',
      run: () => forwardedCheck('hello-spring'),
    },
    redirectCheck,
    {
      name: 'アプリは 127.0.0.1 だけで待ち受ける',
      run: async (exec) => {
        const ip = exec('hostname -i').output.trim().split(/\s+/)[0] ?? '';
        const open = (host: string) => exec(`exec 3<>/dev/tcp/${host}/8080`).ok;
        return expectAll([
          !open('127.0.0.1') && '127.0.0.1:8080 に繋がりません',
          (!ip || open(ip)) && `コンテナの IP（${ip}）の 8080 に繋がります（127.0.0.1 だけのはず）`,
        ]);
      },
    },
  ]);
}

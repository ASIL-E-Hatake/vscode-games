// L2（実行環境の設定）: 実行環境・サーバー構築ガイド（runtime-guide）が組み立てる設定ファイルを、実物で確かめる
// （docs/11-v090-runtime-guide.md 2.5）。`npm run test:runtime-config`。CI の別ジョブ runtime-config（Linux）で実行する。
// 結果は test-results/runtime-config/junit.xml。
// 1. Nginx の conf を nginx の公式コンテナで nginx -t（1.20 = RHEL 9 の既定のストリームと、stable）。TLS ありは自己署名の証明書で
// 2. systemd のユニットを RHEL 9 の systemd（redhat/ubi9-init）で systemd-analyze verify
// 3. 公式の Tomcat 10.1 / 11 に setenv.sh・server.xml の変更・systemd のユニットと同じ配置（CATALINA_HOME と BASE を分ける）を当て、
//    小さな war が組み立てた Nginx 経由で応答すること・版が出ないこと・シャットダウンポートが閉じていることを確かめる
// 4. Spring Boot（組み込み Tomcat）を環境変数ファイルの値で動かし、Nginx 経由で https・利用者の IP が見えることを確かめる
// それぞれ「壊した設定・元のままの設定が不合格になる」こと（検査が働いていること）も毎回確かめる。
// - Docker（デーモン）が無ければスキップとして記録する（CI ではスキップで失敗する）
// - イメージ・依存のダウンロードで外部と通信するのはこの検査（CI・開発者の手元）だけ。拡張機能は通信しない
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GuideInput } from '../src/features/runtime-guide/types';
import { writeJUnit, type JUnitCase } from './junit';
import { docker, tail } from './runtime-config-docker';
import { generateText } from './runtime-configs';
import { springScenario, tomcatScenario, type Check } from './runtime-config-stacks';

export const NGINX_IMAGES = ['nginx:1.20', 'nginx:stable'];
export const SYSTEMD_IMAGE = 'redhat/ubi9-init';

const NGINX_VARIANTS: { name: string; patch: Partial<GuideInput> }[] = [
  { name: 'TLS あり・HTTP から転送', patch: {} },
  { name: 'TLS あり・転送なし', patch: { httpRedirect: false } },
  { name: 'TLS なし', patch: { tls: false } },
  {
    name: 'Amazon Linux 2023・別のポートとドメイン',
    patch: { os: 'al2023', appPort: 9090, domain: 'shop.example.co.jp', maxBodySize: '1g' },
  },
];

/** 一時フォルダにファイルを書き、/work に読み取り専用でつないで sh -c を実行する */
function runWith(
  image: string,
  files: Record<string, string>,
  script: string,
): { ok: boolean; output: string } {
  const dir = mkdtempSync(join(tmpdir(), 'runtime-config-'));
  try {
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    return docker(
      [
        'run',
        '--rm',
        // listen [::]:80 のため IPv6 を使えるようにする（Linux の Docker はコンテナの IPv6 が既定で無効のことがある）
        '--sysctl',
        'net.ipv6.conf.all.disable_ipv6=0',
        '--mount',
        `type=bind,src=${dir},dst=/work,readonly`,
        image,
        'sh',
        '-c',
        script,
      ],
      undefined,
      180_000,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** nginx -t を通す。証明書は conf に書かれたパスに自己署名で作る。警告（[warn]）も不合格にする */
function nginxTest(image: string, conf: string): string | undefined {
  const cert = /ssl_certificate (\S+);/.exec(conf)?.[1];
  const key = /ssl_certificate_key (\S+);/.exec(conf)?.[1];
  const script = [
    cert && key
      ? `mkdir -p "$(dirname ${cert})" "$(dirname ${key})" && openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=localhost -keyout ${key} -out ${cert} 2>/dev/null`
      : 'true',
    'rm -f /etc/nginx/conf.d/default.conf',
    'cp /work/app.conf /etc/nginx/conf.d/app.conf',
    'nginx -t',
  ].join(' && ');
  const r = runWith(image, { 'app.conf': conf }, script);
  if (!r.ok || /\[(warn|emerg|alert)\]/.test(r.output))
    return `nginx -t が通りません\n${tail(r.output)}\n--- conf ---\n${conf}`;
  return undefined;
}

/** systemd-analyze verify を通す。ユニットが参照するユーザー・実行ファイル・フォルダは仮に作る。出力が 1 行でもあれば不合格 */
function systemdVerify(units: Record<string, string>): string | undefined {
  const java = '/usr/lib/jvm/temurin-21-jdk/bin/java';
  const script = [
    // Windows の手元ではつないだファイルに実行権限が付いて見えるため、サーバーと同じ 644 にする
    'cp /work/*.service /etc/systemd/system/ && chmod 644 /etc/systemd/system/*.service',
    'useradd --system myapp && useradd --system tomcat',
    `mkdir -p ${java.replace(/\/java$/, '')} /opt/myapp /etc/myapp /opt/tomcat/apache-tomcat-10.1.48/bin /opt/tomcat/base/logs /opt/tomcat/base/temp /opt/tomcat/base/work /opt/tomcat/base/webapps`,
    'ln -s /opt/tomcat/apache-tomcat-10.1.48 /opt/tomcat/current',
    `printf '#!/bin/sh\\n' > ${java} && cp ${java} /opt/tomcat/current/bin/catalina.sh && chmod 755 ${java} /opt/tomcat/current/bin/catalina.sh`,
    'touch /opt/myapp/app.jar && install -m 600 /dev/null /etc/myapp/myapp.env',
    `systemd-analyze verify ${Object.keys(units)
      .map((n) => `/etc/systemd/system/${n}`)
      .join(' ')} 2>&1`,
  ].join(' && ');
  // 先に取得しておく（docker run がイメージを取得したときのログが出力に混ざり、不合格と見なされるため）
  const pulled = docker(['pull', '--quiet', SYSTEMD_IMAGE]);
  if (!pulled.ok) return `${SYSTEMD_IMAGE} を取得できません\n${tail(pulled.output)}`;
  const r = runWith(SYSTEMD_IMAGE, units, `${script}; echo "rc=$?"`);
  const out = r.output.trim();
  if (!r.ok || out !== 'rc=0')
    return `systemd-analyze verify が通りません\n${tail(out)}\n--- unit ---\n${Object.values(units).join('\n----\n')}`;
  return undefined;
}

/** 「通らないはず」の検査（検査が働いていることの確認） */
const mustFail = (failure: string | undefined) =>
  failure ? undefined : '壊した設定が合格になりました（検査が働いていません）';

function staticChecks(): Check[] {
  const checks: Check[] = [];
  for (const image of NGINX_IMAGES) {
    for (const v of NGINX_VARIANTS) {
      checks.push({
        name: `nginx -t（${image}）/ ${v.name}`,
        run: async () => nginxTest(image, generateText('nginx-conf', v.patch)),
      });
    }
  }
  checks.push({
    name: `nginx -t（${NGINX_IMAGES[1]}）/ （検査の確認）セミコロンの抜けた設定が不合格になる`,
    run: async () =>
      mustFail(
        nginxTest(
          NGINX_IMAGES[1]!,
          generateText('nginx-conf').replace('proxy_http_version 1.1;', 'proxy_http_version 1.1'),
        ),
      ),
  });
  checks.push({
    name: 'systemd-analyze verify / Spring Boot と外部 Tomcat のユニット',
    run: async () =>
      systemdVerify({
        'myapp.service': generateText('systemd-spring'),
        'tomcat.service': generateText('systemd-tomcat'),
      }),
  });
  checks.push({
    name: 'systemd-analyze verify / 別のアプリ名・ユーザー・ポート',
    run: async () =>
      systemdVerify({
        'order-api.service': generateText('systemd-spring', {
          appName: 'order-api',
          appUser: 'tomcat',
          appPort: 9090,
        }),
      }),
  });
  checks.push({
    name: 'systemd-analyze verify / （検査の確認）綴りを誤ったユニットが不合格になる',
    run: async () =>
      mustFail(
        systemdVerify({
          'myapp.service': generateText('systemd-spring').replace(
            'ProtectSystem=strict',
            'ProtectSytem=strict',
          ),
        }),
      ),
  });
  return checks;
}

async function main() {
  const started = Date.now();
  const checks: Check[] = [
    ...staticChecks(),
    ...tomcatScenario('10.1'),
    ...tomcatScenario('11.0'),
    ...springScenario(),
  ];
  const names = checks.map((c) => `L2 実行環境の設定 / ${c.name}`);
  const out = join('test-results', 'runtime-config', 'junit.xml');
  const daemon = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
    encoding: 'utf8',
  });
  if (daemon.status !== 0) {
    writeJUnit(out, 'L2 実行環境の設定', [], names);
    console.log('Docker（デーモン）が無いため、実行環境の設定の検査をスキップしました');
    if (process.env.CI) {
      console.error('CI では Docker を用意してください');
      process.exit(1);
    }
    return;
  }
  const cases: JUnitCase[] = [];
  // ポートを同じ番号で使い回すため、1 つずつ順に実行する（Tomcat・Spring の検査は、準備 → 確かめる → 片付け の順に並んでいる）
  for (const [i, c] of checks.entries()) {
    const t = Date.now();
    let failure: string | undefined;
    try {
      failure = await c.run();
    } catch (e) {
      failure = e instanceof Error ? e.message : String(e);
    }
    cases.push({ name: names[i]!, failure });
    console.log(`${failure ? '✘' : '✔'} ${c.name}（${Math.round((Date.now() - t) / 1000)} 秒）`);
    if (failure) console.log(failure);
  }
  writeJUnit(out, 'L2 実行環境の設定', cases);
  const failed = cases.filter((c) => c.failure).length;
  console.log(
    `\n${cases.length - failed} 件成功 / ${failed} 件失敗（${Math.round((Date.now() - started) / 1000)} 秒）`,
  );
  if (failed > 0) process.exit(1);
}

if (process.argv[1]?.endsWith('runtime-config-e2e.ts')) void main();

import { describe, expect, it } from 'vitest';
import { fileText, type OutputFile } from '../../../core/fileOutput';
import { DEFAULT_GUIDE_INPUT, GENERATOR_IDS, type GeneratorId, type GuideInput } from '../types';
import { GENERATORS } from './index';
import { javaOptsWithOom } from './systemd';
import { splitJavaOpts, tomcatMajor } from './validate';

const input = (patch: Partial<GuideInput> = {}): GuideInput => ({
  ...DEFAULT_GUIDE_INPUT,
  ...patch,
});

function files(id: GeneratorId, patch: Partial<GuideInput> = {}): OutputFile[] {
  const result = GENERATORS[id](input(patch));
  if (!Array.isArray(result)) throw new Error(result.errors.join(' / '));
  return result;
}

const text = (id: GeneratorId, patch: Partial<GuideInput> = {}, index = 0) =>
  fileText(files(id, patch)[index]!);

function errors(id: GeneratorId, patch: Partial<GuideInput>): string[] {
  const result = GENERATORS[id](input(patch));
  return Array.isArray(result) ? [] : result.errors;
}

/** 入力の組み合わせ（どれも組み立てられる） */
const VARIANTS: Partial<GuideInput>[] = [
  {},
  { tls: false },
  { tls: true, httpRedirect: false },
  { appName: 'order-api', appUser: 'order_api', appPort: 9090, os: 'al2023' },
  { javaVersion: '17', javaOpts: '' },
  { javaVersion: '25', javaOpts: '-Xmx1g -XX:+ExitOnOutOfMemoryError', springProfile: '' },
  { tomcatVersion: '11.0.13', tomcatRoot: '/srv/tomcat', catalinaBase: '/srv/tomcat-base' },
  { domain: 'a.b-c.example.co.jp', maxBodySize: '512k' },
];

describe('runtime-guide の設定ファイルの組み立て', () => {
  describe('すべての組み立て × 入力の組み合わせ', () => {
    for (const id of GENERATOR_IDS) {
      for (const [i, v] of VARIANTS.entries()) {
        it(`${id} / 組み合わせ ${i}: 空でない行にはすべて説明がある・改行は LF・末尾の空白が無い`, () => {
          const out = files(id, v);
          expect(out.length).toBeGreaterThan(0);
          for (const file of out) {
            expect(file.name).toMatch(/^\//);
            expect(file.lines.length).toBeGreaterThan(0);
            for (const line of file.lines) {
              if (line.text.trim()) expect(line.explain?.trim(), line.text).toBeTruthy();
              expect(line.text).not.toMatch(/\r|[ \t]$/m);
            }
          }
        });
      }
    }
  });

  describe('nginx-conf', () => {
    it('TLS あり・HTTP からの転送あり（既定）', () => {
      const conf = text('nginx-conf');
      expect(files('nginx-conf')[0]!.name).toBe('/etc/nginx/conf.d/myapp.conf');
      expect(conf).toContain('return 301 https://app.example.com$request_uri;');
      expect(conf).toContain('listen 443 ssl;');
      expect(conf).toContain('ssl_certificate /etc/pki/tls/certs/app.example.com.crt;');
      expect(conf).toContain('ssl_certificate_key /etc/pki/tls/private/app.example.com.key;');
      expect(conf).toContain('ssl_protocols TLSv1.2 TLSv1.3;');
      expect(conf).toContain('proxy_pass http://127.0.0.1:8080;');
      for (const h of ['Host $host', 'X-Real-IP', 'X-Forwarded-For', 'X-Forwarded-Proto $scheme']) {
        expect(conf).toContain(`proxy_set_header ${h}`);
      }
      expect(conf).toContain('server_tokens off;');
      expect(conf).toContain('client_max_body_size 10m;');
      expect(conf).toContain('X-Content-Type-Options "nosniff" always');
      expect(conf).toContain('Referrer-Policy');
      expect(conf).toContain('Strict-Transport-Security');
      expect(conf).not.toContain('Content-Security-Policy');
      // 転送先は利用者の Host ではなく固定のドメイン
      expect(conf).not.toContain('https://$host');
      // 波かっこの対応
      expect(conf.split('{').length).toBe(conf.split('}').length);
    });

    it('TLS なし: 80 番だけ・HSTS と証明書が無い・注意が出る', () => {
      const out = files('nginx-conf', { tls: false })[0]!;
      const conf = fileText(out);
      expect(conf).not.toMatch(/443|ssl_|Strict-Transport-Security|return 301/);
      expect(conf).toContain('listen 80;');
      expect(conf).toContain('proxy_pass http://127.0.0.1:8080;');
      expect(out.warnings?.[0]).toContain('TLS なし');
    });

    it('TLS あり・転送なし: 80 番の server が無い', () => {
      const conf = text('nginx-conf', { httpRedirect: false });
      expect(conf).not.toContain('listen 80;');
      expect(conf).not.toContain('return 301');
      expect(conf).toContain('listen 443 ssl;');
    });

    it('TLS なしのときは証明書のパスを検査しない', () => {
      expect(errors('nginx-conf', { tls: false, certPath: '', keyPath: 'x y' })).toEqual([]);
    });

    it('ポート・ドメイン・上限・アプリ名が反映される', () => {
      const out = files('nginx-conf', {
        appName: 'shop',
        appPort: 18080,
        domain: 'shop.example.co.jp',
        maxBodySize: '1g',
      })[0]!;
      const conf = fileText(out);
      expect(out.name).toBe('/etc/nginx/conf.d/shop.conf');
      expect(conf).toContain('proxy_pass http://127.0.0.1:18080;');
      expect(conf).toContain('server_name shop.example.co.jp;');
      expect(conf).toContain('client_max_body_size 1g;');
    });

    it('注意: SELinux・firewalld・Spring の forward-headers-strategy・CSP（OS で出し分け）', () => {
      const rhel = files('nginx-conf')[0]!.warnings!.join('\n');
      expect(rhel).toContain('httpd_can_network_connect');
      expect(rhel).toContain('firewall-cmd');
      expect(rhel).toContain('server.forward-headers-strategy=framework');
      expect(rhel).toContain('Content-Security-Policy');
      const al = files('nginx-conf', { os: 'al2023' })[0]!.warnings!.join('\n');
      expect(al).toContain('permissive');
      expect(al).toContain('セキュリティグループ');
    });

    it('説明をコメントで入れても、各行の字下げが保たれる', () => {
      const conf = fileText(files('nginx-conf')[0]!, { withComments: true });
      expect(conf).toMatch(/\n {8}# 転送先。[^\n]*\n {8}proxy_pass/);
    });
  });

  describe('systemd-spring', () => {
    it('ユニット: 専用ユーザー・EnvironmentFile・ExecStart・守り', () => {
      const unit = text('systemd-spring');
      expect(files('systemd-spring')[0]!.name).toBe('/etc/systemd/system/myapp.service');
      expect(unit).toContain('User=myapp\nGroup=myapp');
      expect(unit).toContain('WorkingDirectory=/opt/myapp');
      expect(unit).toContain('EnvironmentFile=/etc/myapp/myapp.env');
      expect(unit).toContain(
        'ExecStart=/usr/lib/jvm/temurin-21-jdk/bin/java $JAVA_OPTS -jar /opt/myapp/app.jar',
      );
      for (const l of [
        'SuccessExitStatus=143',
        'Restart=on-failure',
        'TimeoutStopSec=',
        'NoNewPrivileges=true',
        'ProtectSystem=strict',
        'ProtectHome=true',
        'PrivateTmp=true',
        'WantedBy=multi-user.target',
      ]) {
        expect(unit).toContain(l);
      }
      // 秘密を ExecStart やユニットに書かない
      expect(unit).not.toMatch(/PASSWORD|Environment=/);
    });

    it('環境変数ファイル: プロファイル・JAVA_OPTS・ポート・127.0.0.1・forward-headers', () => {
      const out = files('systemd-spring');
      expect(out[1]!.name).toBe('/etc/myapp/myapp.env');
      const env = fileText(out[1]!);
      expect(env).toContain('SPRING_PROFILES_ACTIVE=prod');
      expect(env).toContain('JAVA_OPTS="-Xms256m -Xmx512m -XX:+ExitOnOutOfMemoryError"');
      expect(env).toContain('SERVER_PORT=8080');
      expect(env).toContain('SERVER_ADDRESS=127.0.0.1');
      expect(env).toContain('SERVER_FORWARD_HEADERS_STRATEGY=framework');
      expect(out[0]!.warnings!.join('\n')).toContain('600');
    });

    it('プロファイルが空なら書かない・Java の版でパスが変わる', () => {
      const out = files('systemd-spring', { springProfile: '', javaVersion: '25' });
      expect(fileText(out[1]!)).not.toContain('SPRING_PROFILES_ACTIVE');
      expect(fileText(out[0]!)).toContain('/usr/lib/jvm/temurin-25-jdk/bin/java');
    });
  });

  describe('tomcat-setenv', () => {
    it('JAVA_HOME・CATALINA_OPTS・UMASK（根拠の無いオプションは書かない）', () => {
      const out = files('tomcat-setenv')[0]!;
      const sh = fileText(out);
      expect(out.name).toBe('/opt/tomcat/base/bin/setenv.sh');
      expect(sh).toBe(
        [
          'JAVA_HOME=/usr/lib/jvm/temurin-21-jdk',
          'CATALINA_OPTS="$CATALINA_OPTS -Xms256m -Xmx512m"',
          'CATALINA_OPTS="$CATALINA_OPTS -XX:+ExitOnOutOfMemoryError"',
          'UMASK=0027',
          '',
        ].join('\n'),
      );
      expect(sh).not.toMatch(/egd|file\.encoding|JAVA_OPTS=/);
    });

    it('Java 17 だけ file.encoding を足す・空の JVM オプションは書かない', () => {
      const sh = text('tomcat-setenv', { javaVersion: '17', javaOpts: '' });
      expect(sh).toContain('-Dfile.encoding=UTF-8');
      expect(sh).not.toContain('"$CATALINA_OPTS "');
    });

    it('ExitOnOutOfMemoryError を二重に書かない', () => {
      const sh = text('tomcat-setenv', { javaOpts: '-Xmx1g -XX:+ExitOnOutOfMemoryError' });
      expect(sh.split('ExitOnOutOfMemoryError').length).toBe(2);
    });
  });

  describe('tomcat-server-xml', () => {
    it('シャットダウンポート -1・127.0.0.1 のコネクタ・RemoteIpValve・AccessLogValve・ErrorReportValve', () => {
      const out = files('tomcat-server-xml')[0]!;
      const xml = fileText(out);
      expect(out.name).toBe('/opt/tomcat/base/conf/server.xml');
      expect(xml).toContain('<Server port="-1" shutdown="SHUTDOWN">');
      expect(xml).toContain('<Connector address="127.0.0.1" port="8080" protocol="HTTP/1.1"');
      expect(xml).toContain('org.apache.catalina.valves.RemoteIpValve');
      expect(xml).toContain('internalProxies="127\\.0\\.0\\.1|0:0:0:0:0:0:0:1"');
      expect(xml).toContain('protocolHeader="X-Forwarded-Proto"');
      expect(xml).toContain('requestAttributesEnabled="true"');
      expect(xml).toContain('showReport="false" showServerInfo="false"');
      expect(xml).not.toMatch(/redirectPort|AJP/);
      // XML のコメントの中に -- を含めない（XML の誤りになる）
      for (const c of xml.match(/<!--([\s\S]*?)-->/g) ?? []) {
        expect(c.slice(4, -3)).not.toContain('--');
      }
    });

    it('ポートと版が反映される', () => {
      const out = files('tomcat-server-xml', { appPort: 8081, tomcatVersion: '11.0.13' })[0]!;
      expect(fileText(out)).toContain('port="8081"');
      expect(out.warnings!.join('\n')).toContain('Tomcat 11.0');
    });
  });

  describe('systemd-tomcat', () => {
    it('CATALINA_HOME（current のリンク）と CATALINA_BASE を分け、catalina.sh run で動かす', () => {
      const unit = text('systemd-tomcat');
      expect(unit).toContain('User=tomcat');
      expect(unit).toContain('Environment=CATALINA_HOME=/opt/tomcat/current');
      expect(unit).toContain('Environment=CATALINA_BASE=/opt/tomcat/base');
      expect(unit).toContain('ExecStart=/opt/tomcat/current/bin/catalina.sh run');
      expect(unit).toContain('SuccessExitStatus=143');
      expect(unit).toContain(
        'ReadWritePaths=/opt/tomcat/base/logs /opt/tomcat/base/temp /opt/tomcat/base/work /opt/tomcat/base/webapps',
      );
      expect(unit).not.toMatch(/Type=forking|PIDFile|JAVA_HOME/);
    });

    it('CATALINA_BASE を本体のフォルダの中にはできない', () => {
      expect(errors('systemd-tomcat', { catalinaBase: '/opt/tomcat/current/conf' })).toHaveLength(
        1,
      );
      expect(errors('systemd-tomcat', { catalinaBase: '/opt/tomcat' })).toHaveLength(1);
      expect(errors('systemd-tomcat', { catalinaBase: '/opt/tomcat-base' })).toEqual([]);
    });
  });

  describe('不正な入力（設定ファイルの書き方を壊す値）は errors を返す', () => {
    const BREAKERS = [';', '{', '}', '\n', '"', "'", '$', ' ', '#', '<', '&', '\\', '`', '|', '*'];

    const cases: [GeneratorId, keyof GuideInput, (bad: string) => string][] = [
      ['nginx-conf', 'appName', (b) => `my${b}app`],
      ['nginx-conf', 'domain', (b) => `app${b}.example.com`],
      ['nginx-conf', 'certPath', (b) => `/etc/pki/tls/certs/a${b}b.crt`],
      ['nginx-conf', 'keyPath', (b) => `/etc/pki/tls/private/a${b}b.key`],
      ['nginx-conf', 'maxBodySize', (b) => `10${b}m`],
      ['systemd-spring', 'appName', (b) => `my${b}app`],
      ['systemd-spring', 'appUser', (b) => `my${b}app`],
      ['systemd-spring', 'installDir', (b) => `/opt/my${b}app`],
      ['systemd-spring', 'jarName', (b) => `app${b}.jar`],
      ['systemd-spring', 'javaOpts', (b) => `-Xmx512${b}m`],
      ['systemd-spring', 'springProfile', (b) => `prod${b}`],
      ['tomcat-setenv', 'javaOpts', (b) => `-Xmx512${b}m`],
      ['tomcat-setenv', 'catalinaBase', (b) => `/opt/tomcat/ba${b}se`],
      ['tomcat-server-xml', 'catalinaBase', (b) => `/opt/tomcat/ba${b}se`],
      ['tomcat-server-xml', 'tomcatVersion', (b) => `10.1.4${b}`],
      ['systemd-tomcat', 'tomcatRoot', (b) => `/opt/tom${b}cat`],
      ['systemd-tomcat', 'catalinaBase', (b) => `/opt/tomcat/ba${b}se`],
      ['systemd-tomcat', 'tomcatUser', (b) => `tom${b}cat`],
    ];
    for (const [id, key, make] of cases) {
      it(`${id} / ${key}`, () => {
        for (const b of BREAKERS) {
          const bad = make(b);
          expect(errors(id, { [key]: bad }), JSON.stringify(bad)).not.toEqual([]);
        }
      });
    }

    it('ポートの範囲（1024〜65535 の整数）', () => {
      for (const id of ['nginx-conf', 'systemd-spring', 'tomcat-server-xml'] as const) {
        for (const port of [0, 80, 443, 1023, 65536, 8080.5, Number.NaN]) {
          expect(errors(id, { appPort: port }), `${id} ${port}`).toHaveLength(1);
        }
        for (const port of [1024, 8080, 65535]) expect(errors(id, { appPort: port })).toEqual([]);
      }
    });

    it('ドメイン名の形', () => {
      for (const d of [
        '',
        '.example.com',
        'example.com.',
        '-a.example.com',
        'a-.example.com',
        'a..b',
        'ａｐｐ.example.com',
        `${'a'.repeat(64)}.com`,
        '*.example.com',
        'app.example.com:443',
      ]) {
        expect(errors('nginx-conf', { domain: d }), d).toHaveLength(1);
      }
      for (const d of [
        'localhost',
        'app.example.com',
        'xn--eckwd4c7c.example.jp',
        'A1.Example.COM',
      ]) {
        expect(errors('nginx-conf', { domain: d }), d).toEqual([]);
      }
    });

    it('パスの形（絶対パス・.. と末尾の / は不可）', () => {
      for (const p of [
        '',
        '/',
        'opt/myapp',
        '/opt/myapp/',
        '/opt/../etc',
        '/opt/./myapp',
        '/opt//myapp',
      ]) {
        expect(errors('systemd-spring', { installDir: p }), p).toHaveLength(1);
      }
    });

    it('root のユーザーは使えない', () => {
      expect(errors('systemd-spring', { appUser: 'root' })[0]).toContain('root');
      expect(errors('systemd-tomcat', { tomcatUser: 'root' })[0]).toContain('root');
    });

    it('Tomcat の版は 10.1 か 11.0', () => {
      for (const v of ['9.0.100', '10.0.27', '11', '10.1', '12.0.1', 'v10.1.48']) {
        expect(errors('tomcat-server-xml', { tomcatVersion: v }), v).toHaveLength(1);
      }
    });

    it('誤りが複数あればすべて返す', () => {
      expect(errors('systemd-spring', { appName: 'A', appUser: 'root', appPort: 1 })).toHaveLength(
        3,
      );
    });
  });

  describe('部品', () => {
    it('splitJavaOpts', () => {
      expect(splitJavaOpts('')).toEqual([]);
      expect(splitJavaOpts('  -Xms1g   -Xmx1g ')).toEqual(['-Xms1g', '-Xmx1g']);
      expect(
        splitJavaOpts('-XX:HeapDumpPath=/var/log/myapp -Duser.timezone=Asia/Tokyo'),
      ).toHaveLength(2);
      expect(splitJavaOpts('Xmx1g')).toBeUndefined();
      expect(splitJavaOpts('-Xmx1g\n-Xms1g')).toBeUndefined();
    });

    it('javaOptsWithOom', () => {
      expect(javaOptsWithOom('')).toEqual(['-XX:+ExitOnOutOfMemoryError']);
      expect(javaOptsWithOom('-XX:+ExitOnOutOfMemoryError')).toEqual([
        '-XX:+ExitOnOutOfMemoryError',
      ]);
    });

    it('tomcatMajor', () => {
      expect(tomcatMajor('10.1.48')).toBe('10.1');
      expect(tomcatMajor('11.0.13')).toBe('11.0');
      expect(tomcatMajor('9.0.1')).toBeUndefined();
    });
  });
});

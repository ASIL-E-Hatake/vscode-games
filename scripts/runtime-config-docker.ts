// L2（実行環境の設定）の検査の部品: docker の呼び出し・HTTP(S) の取得・server.xml への変更の当て方。
// 使うのは scripts/runtime-config-e2e.ts と scripts/runtime-config-stacks.ts。
// 通信するのは検査（CI・開発者の手元）が立てたコンテナ（localhost）だけ。拡張機能は通信しない。
import { spawnSync } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

export interface DockerResult {
  ok: boolean;
  output: string;
}

export function docker(args: string[], cwd?: string, timeoutMs = 600_000): DockerResult {
  const r = spawnSync('docker', args, {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, DOCKER_BUILDKIT: '1' },
  });
  return {
    ok: r.status === 0,
    output: `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? String(r.error) : ''}`,
  };
}

export const tail = (text: string, lines = 60) => text.trim().split('\n').slice(-lines).join('\n');

export interface HttpResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

/**
 * localhost のポートへ、Host（と TLS の SNI）を指定してリクエストする。
 * 自己署名の証明書を使うため、証明書は検証しない（検査用のコンテナだけが相手）
 */
export function httpGet(url: string, host: string, timeoutMs = 5000): Promise<HttpResponse> {
  const u = new URL(url);
  const tls = u.protocol === 'https:';
  const request = tls ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: u.hostname,
        port: u.port,
        path: `${u.pathname}${u.search}`,
        method: 'GET',
        headers: { Host: host },
        timeout: timeoutMs,
        ...(tls ? { servername: host, rejectUnauthorized: false } : {}),
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on('timeout', () => req.destroy(new Error(`${url} が ${timeoutMs} ms で応答しません`)));
    req.on('error', reject);
    req.end();
  });
}

/** url が 200 で、本文に expect を含むまで待つ。待ちきれなければ理由を返す */
export async function waitFor(
  url: string,
  host: string,
  expect: string,
  timeoutMs: number,
): Promise<string | undefined> {
  const until = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < until) {
    try {
      const res = await httpGet(url, host);
      last = `${res.status} ${res.body.slice(0, 500)}`;
      if (res.status === 200 && res.body.includes(expect)) return undefined;
    } catch (e) {
      last = String(e);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return `${url} が応答しません（最後の応答: ${last}）`;
}

function pick(text: string, re: RegExp, what: string): string {
  const m = re.exec(text);
  if (!m) throw new Error(`組み立てた server.xml に ${what} がありません`);
  return m[0];
}

function replaceOnce(xml: string, re: RegExp, to: string, what: string): string {
  const count = xml.match(new RegExp(re.source, 'g'))?.length ?? 0;
  if (count !== 1)
    throw new Error(`元の server.xml の ${what} が ${count} か所あります（1 か所のはず）`);
  return xml.replace(re, () => to);
}

const VALVE = (name: string) =>
  new RegExp(`<Valve className="org\\.apache\\.catalina\\.valves\\.${name}"[\\s\\S]*?/>`);

/**
 * 公式の Tomcat の server.xml（stock）に、組み立てた「変える部分」（generated。①〜④）を当てる。
 * 利用者が手で行う作業（置き換え・追記）と同じことをする。元のコメントは取り除いてから当てる（コメントの中の例に当たらないように）
 */
export function applyServerXml(stock: string, generated: string): string {
  const server = pick(generated, /<Server port="-1"[^>]*>/, '<Server>');
  const connector = pick(generated, /<Connector address="127\.0\.0\.1"[\s\S]*?\/>/, 'Connector');
  const remoteIp = pick(generated, VALVE('RemoteIpValve'), 'RemoteIpValve');
  const accessLog = pick(generated, VALVE('AccessLogValve'), 'AccessLogValve');
  const errorReport = pick(generated, VALVE('ErrorReportValve'), 'ErrorReportValve');

  let xml = stock.replace(/<!--[\s\S]*?-->/g, '');
  xml = replaceOnce(xml, /<Server port="8005" shutdown="SHUTDOWN">/, server, '<Server>');
  xml = replaceOnce(
    xml,
    /<Connector port="8080" protocol="HTTP\/1\.1"[\s\S]*?\/>/,
    connector,
    'Connector',
  );
  xml = replaceOnce(
    xml,
    /<Engine name="Catalina" defaultHost="localhost">/,
    `<Engine name="Catalina" defaultHost="localhost">\n      ${remoteIp}`,
    '<Engine>',
  );
  xml = replaceOnce(
    xml,
    VALVE('AccessLogValve'),
    `${accessLog}\n        ${errorReport}`,
    'AccessLogValve',
  );
  return xml;
}

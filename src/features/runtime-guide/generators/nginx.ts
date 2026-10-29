// Nginx のリバースプロキシの設定（/etc/nginx/conf.d/<アプリ名>.conf）を組み立てる。DOM 非依存。
// 1.20（RHEL 9 の既定のストリーム）以降で通る書き方だけを使う（http2 on; などの新しい書き方は使わない）。
// CI では nginx の公式コンテナで nginx -t を通す（scripts/runtime-config-e2e.ts）
import type { FileLine, OutputFile } from '../../../core/fileOutput';
import type { GuideInput } from '../types';
import { nx } from './nginxStrings';
import { label } from './strings';
import {
  checkAppName,
  checkDomain,
  checkMaxBodySize,
  checkPath,
  checkPort,
  collect,
} from './validate';
import type { GeneratorResult } from './index';

const I = '    ';

function proxyLines(input: GuideInput): FileLine[] {
  return [
    { text: `${I}location / {`, explain: nx.location },
    {
      text: `${I}${I}proxy_pass http://127.0.0.1:${input.appPort};`,
      explain: nx.proxyPass(input.appPort),
    },
    { text: `${I}${I}proxy_http_version 1.1;`, explain: nx.httpVersion },
    { text: `${I}${I}proxy_set_header Host $host;`, explain: nx.host },
    { text: `${I}${I}proxy_set_header X-Real-IP $remote_addr;`, explain: nx.realIp },
    { text: `${I}${I}proxy_set_header X-Forwarded-For $remote_addr;`, explain: nx.forwardedFor },
    { text: `${I}${I}proxy_set_header X-Forwarded-Proto $scheme;`, explain: nx.forwardedProto },
    { text: `${I}${I}proxy_connect_timeout 5s;`, explain: nx.connectTimeout },
    { text: `${I}${I}proxy_send_timeout 60s;`, explain: nx.sendTimeout },
    { text: `${I}${I}proxy_read_timeout 60s;`, explain: nx.readTimeout },
    { text: `${I}}`, explain: nx.locationEnd },
  ];
}

function commonLines(input: GuideInput): FileLine[] {
  const lines: FileLine[] = [
    { text: `${I}server_tokens off;`, explain: nx.serverTokens },
    {
      text: `${I}client_max_body_size ${input.maxBodySize};`,
      explain: nx.maxBody(input.maxBodySize),
    },
    { text: '' },
    {
      text: `${I}add_header X-Content-Type-Options "nosniff" always;`,
      explain: `${nx.nosniff}。${nx.headersNote}`,
    },
    {
      text: `${I}add_header Referrer-Policy "strict-origin-when-cross-origin" always;`,
      explain: nx.referrer,
    },
  ];
  if (input.tls) {
    lines.push({
      text: `${I}add_header Strict-Transport-Security "max-age=31536000" always;`,
      explain: nx.hsts,
    });
  }
  return lines;
}

function redirectServer(domain: string): FileLine[] {
  return [
    { text: 'server {', explain: nx.redirectServer },
    { text: `${I}listen 80;`, explain: nx.listen80 },
    { text: `${I}listen [::]:80;`, explain: nx.listen80v6 },
    { text: `${I}server_name ${domain};`, explain: nx.serverName(domain) },
    { text: `${I}return 301 https://${domain}$request_uri;`, explain: nx.redirect(domain) },
    { text: '}', explain: nx.blockEnd },
    { text: '' },
  ];
}

function mainServer(input: GuideInput): FileLine[] {
  const { domain } = input;
  const head: FileLine[] = input.tls
    ? [
        { text: 'server {', explain: nx.mainServerTls },
        { text: `${I}listen 443 ssl;`, explain: nx.listen443 },
        { text: `${I}listen [::]:443 ssl;`, explain: nx.listen443v6 },
        { text: `${I}server_name ${domain};`, explain: nx.serverName(domain) },
        { text: '' },
        { text: `${I}ssl_certificate ${input.certPath};`, explain: nx.cert },
        { text: `${I}ssl_certificate_key ${input.keyPath};`, explain: nx.key },
        { text: `${I}ssl_protocols TLSv1.2 TLSv1.3;`, explain: nx.protocols },
        { text: `${I}ssl_session_cache shared:SSL:10m;`, explain: nx.sessionCache },
        { text: `${I}ssl_session_timeout 1d;`, explain: nx.sessionTimeout },
        { text: `${I}ssl_session_tickets off;`, explain: nx.sessionTickets },
        { text: '' },
      ]
    : [
        { text: 'server {', explain: nx.mainServerHttp },
        { text: `${I}listen 80;`, explain: nx.listen80 },
        { text: `${I}listen [::]:80;`, explain: nx.listen80v6 },
        { text: `${I}server_name ${domain};`, explain: nx.serverName(domain) },
        { text: '' },
      ];
  return [
    ...head,
    ...commonLines(input),
    { text: '' },
    ...proxyLines(input),
    { text: '}', explain: nx.blockEnd },
  ];
}

function warnings(input: GuideInput): string[] {
  const al = input.os === 'al2023';
  const list = [
    nx.warnTest,
    al ? nx.warnSelinuxAl : nx.warnSelinux,
    al ? nx.warnFirewallAl(input.tls) : nx.warnFirewalld(input.tls),
    nx.warnSpring,
    nx.warnCsp,
  ];
  if (!input.tls) list.unshift(nx.warnNoTls);
  else if (!input.httpRedirect) list.unshift(nx.warnTlsOnly);
  return list;
}

export function validateNginx(input: GuideInput): string[] {
  return collect(
    checkAppName(input.appName),
    checkDomain(input.domain),
    checkPort(input.appPort),
    checkMaxBodySize(input.maxBodySize),
    input.tls ? checkPath(label.certPath, input.certPath) : undefined,
    input.tls ? checkPath(label.keyPath, input.keyPath) : undefined,
  );
}

export function nginxConf(input: GuideInput): GeneratorResult {
  const errors = validateNginx(input);
  if (errors.length) return { errors };
  const lines = [
    ...(input.tls && input.httpRedirect ? redirectServer(input.domain) : []),
    ...mainServer(input),
  ];
  const file: OutputFile = {
    name: `/etc/nginx/conf.d/${input.appName}.conf`,
    language: 'nginx',
    comment: '#',
    lines,
    warnings: warnings(input),
  };
  return [file];
}

// 外部 Tomcat の setenv.sh（CATALINA_BASE/bin）と、server.xml の変える部分を組み立てる。DOM 非依存。
// server.xml は全体ではなく「置き換える・足すブロック」を①〜④の順に出す（元の server.xml は版ごとにコメントなどが違うため、
// 全体を出すと上げるたびに見比べることになる）。各ブロックの先頭の XML のコメントに、置く場所と元の行を書く。
// CI では公式の Tomcat 10.1 / 11 に当てて起動し、Nginx 経由で確かめる（scripts/runtime-config-e2e.ts）
import type { FileLine } from '../../../core/fileOutput';
import { temurinHome, type GuideInput } from '../types';
import {
  checkJavaOpts,
  checkPath,
  checkPort,
  checkTomcatLayout,
  checkTomcatVersion,
  collect,
  splitJavaOpts,
  tomcatMajor,
} from './validate';
import { label } from './strings';
import { EXIT_ON_OOM } from './systemd';
import { tc } from './tomcatStrings';
import type { GeneratorResult } from './index';

export function validateTomcatSetenv(input: GuideInput): string[] {
  return [...checkTomcatLayout(input), ...collect(checkJavaOpts(input.javaOpts))];
}

export function tomcatSetenv(input: GuideInput): GeneratorResult {
  const errors = validateTomcatSetenv(input);
  if (errors.length) return { errors };
  const javaHome = temurinHome(input.javaVersion);
  const opts = splitJavaOpts(input.javaOpts) ?? [];
  const lines: FileLine[] = [{ text: `JAVA_HOME=${javaHome}`, explain: tc.javaHome(javaHome) }];
  if (opts.length) {
    lines.push({
      text: `CATALINA_OPTS="$CATALINA_OPTS ${opts.join(' ')}"`,
      explain: tc.catalinaOpts,
    });
  }
  if (!opts.includes(EXIT_ON_OOM)) {
    lines.push({ text: `CATALINA_OPTS="$CATALINA_OPTS ${EXIT_ON_OOM}"`, explain: tc.exitOnOom });
  }
  if (input.javaVersion === '17' && !opts.some((o) => o.startsWith('-Dfile.encoding='))) {
    lines.push({
      text: 'CATALINA_OPTS="$CATALINA_OPTS -Dfile.encoding=UTF-8"',
      explain: tc.fileEncoding,
    });
  }
  lines.push({ text: 'UMASK=0027', explain: tc.umask });
  const path = `${input.catalinaBase}/bin/setenv.sh`;
  return [
    {
      name: path,
      language: 'shellscript',
      comment: '#',
      lines,
      warnings: [
        tc.header,
        tc.notWritten,
        tc.warnSetenvOwner(path, input.tomcatUser),
        tc.warnJavaUpgrade,
      ],
    },
  ];
}

export function validateTomcatServerXml(input: GuideInput): string[] {
  return collect(
    checkTomcatVersion(input.tomcatVersion),
    checkPort(input.appPort),
    checkPath(label.catalinaBase, input.catalinaBase),
  );
}

const xmlComment = (text: string) => `<!-- ${text} -->`;

export function tomcatServerXml(input: GuideInput): GeneratorResult {
  const errors = validateTomcatServerXml(input);
  if (errors.length) return { errors };
  const major = tomcatMajor(input.tomcatVersion)!;
  const port = input.appPort;
  const path = `${input.catalinaBase}/conf/server.xml`;
  const lines: FileLine[] = [
    {
      text: [xmlComment(tc.placeShutdown), '<Server port="-1" shutdown="SHUTDOWN">'].join('\n'),
      explain: tc.shutdownPort,
    },
    { text: '' },
    {
      text: [
        xmlComment(tc.placeConnector),
        `    <Connector address="127.0.0.1" port="${port}" protocol="HTTP/1.1"`,
        '               connectionTimeout="20000"',
        '               maxParameterCount="1000" />',
      ].join('\n'),
      explain: `${tc.connector(port)}。${tc.ajp}`,
    },
    { text: '' },
    {
      text: [
        xmlComment(tc.placeRemoteIp),
        '      <Valve className="org.apache.catalina.valves.RemoteIpValve"',
        '             internalProxies="127\\.0\\.0\\.1|0:0:0:0:0:0:0:1"',
        '             remoteIpHeader="X-Forwarded-For"',
        '             protocolHeader="X-Forwarded-Proto" />',
      ].join('\n'),
      explain: tc.remoteIp,
    },
    { text: '' },
    {
      text: [
        xmlComment(tc.placeHost),
        '        <Valve className="org.apache.catalina.valves.AccessLogValve" directory="logs"',
        '               prefix="localhost_access_log" suffix=".txt"',
        '               requestAttributesEnabled="true"',
        '               pattern="%a %l %u %t &quot;%r&quot; %s %b %D" />',
      ].join('\n'),
      explain: tc.accessLog,
    },
    {
      text: [
        '        <Valve className="org.apache.catalina.valves.ErrorReportValve"',
        '               showReport="false" showServerInfo="false" />',
      ].join('\n'),
      explain: tc.errorReport,
    },
  ];
  return [
    {
      name: path,
      language: 'xml',
      lines,
      warnings: [
        tc.warnPartial(path),
        tc.warnVersion(major),
        tc.warnApps(input.catalinaBase),
        tc.warnCheck,
        tc.warnSpringBoot,
      ],
    },
  ];
}

// systemd のユニット（Spring Boot の組み込み Tomcat / 外部 Tomcat）と、Spring Boot の環境変数ファイルを組み立てる。DOM 非依存。
// CI では RHEL 9 の systemd（252）で systemd-analyze verify を通す（scripts/runtime-config-e2e.ts）
import type { FileLine, OutputFile } from '../../../core/fileOutput';
import { temurinHome, type GuideInput } from '../types';
import { label } from './strings';
import { sd } from './systemdStrings';
import {
  catalinaHome,
  checkAppName,
  checkJarName,
  checkJavaOpts,
  checkPath,
  checkPort,
  checkProfile,
  checkTomcatLayout,
  checkUser,
  collect,
  splitJavaOpts,
} from './validate';
import type { GeneratorResult } from './index';

/** メモリ不足で止める（中途半端に動き続けない）。入力に無ければ足す */
export const EXIT_ON_OOM = '-XX:+ExitOnOutOfMemoryError';

/** 入力の JVM のオプションに -XX:+ExitOnOutOfMemoryError を足したもの（検査済みの値に使う） */
export function javaOptsWithOom(javaOpts: string): string[] {
  const opts = splitJavaOpts(javaOpts) ?? [];
  return opts.includes(EXIT_ON_OOM) ? opts : [...opts, EXIT_ON_OOM];
}

/** 環境変数ファイルのパス（/etc/<アプリ名>/<アプリ名>.env） */
export function envFilePath(appName: string): string {
  return `/etc/${appName}/${appName}.env`;
}

const unitHead = (description: FileLine): FileLine[] => [
  { text: '[Unit]', explain: sd.unit },
  description,
  { text: 'After=network-online.target', explain: sd.after },
  { text: 'Wants=network-online.target', explain: sd.wants },
  { text: '' },
  { text: '[Service]', explain: sd.service },
  { text: 'Type=exec', explain: sd.typeExec },
];

const user = (u: string): FileLine[] => [
  { text: `User=${u}`, explain: sd.user(u) },
  { text: `Group=${u}`, explain: sd.group(u) },
];

const lifecycle = (timeoutStop: FileLine): FileLine[] => [
  { text: 'SuccessExitStatus=143', explain: sd.successExit },
  { text: 'Restart=on-failure', explain: sd.restart },
  { text: 'RestartSec=5s', explain: sd.restartSec },
  timeoutStop,
  { text: 'UMask=0027', explain: sd.umask },
];

/** 守りの設定。writable は ProtectSystem=strict の後に置く書き込みの許可 */
const hardening = (writable: FileLine): FileLine[] => [
  { text: '' },
  { text: 'NoNewPrivileges=true', explain: `${sd.hardening}。${sd.noNewPrivileges}` },
  { text: 'ProtectSystem=strict', explain: sd.protectSystem },
  writable,
  { text: 'ProtectHome=true', explain: sd.protectHome },
  { text: 'PrivateTmp=true', explain: sd.privateTmp },
  {
    text: 'ProtectKernelTunables=true\nProtectKernelModules=true\nProtectControlGroups=true',
    explain: sd.protectKernel,
  },
];

const install: FileLine[] = [
  { text: '' },
  { text: '[Install]', explain: sd.install },
  { text: 'WantedBy=multi-user.target', explain: sd.wantedBy },
];

export function validateSystemdSpring(input: GuideInput): string[] {
  return collect(
    checkAppName(input.appName),
    checkUser(label.appUser, input.appUser),
    checkPath(label.installDir, input.installDir),
    checkJarName(input.jarName),
    checkJavaOpts(input.javaOpts),
    checkProfile(input.springProfile),
    checkPort(input.appPort),
  );
}

function springUnit(input: GuideInput): OutputFile {
  const app = input.appName;
  const java = `${temurinHome(input.javaVersion)}/bin/java`;
  const env = envFilePath(app);
  const path = `/etc/systemd/system/${app}.service`;
  return {
    name: path,
    language: 'ini',
    comment: '#',
    lines: [
      ...unitHead({
        text: `Description=${app} (Spring Boot)`,
        explain: sd.descriptionSpring(app),
      }),
      ...user(input.appUser),
      { text: `WorkingDirectory=${input.installDir}`, explain: sd.workingDir(input.installDir) },
      { text: `EnvironmentFile=${env}`, explain: sd.envFile(env) },
      {
        text: `ExecStart=${java} $JAVA_OPTS -jar ${input.installDir}/${input.jarName}`,
        explain: sd.execStartSpring(java),
      },
      ...lifecycle({ text: 'TimeoutStopSec=45s', explain: sd.timeoutStopSpring }),
      ...hardening({ text: `LogsDirectory=${app}`, explain: sd.logsDirSpring(app) }),
      ...install,
    ],
    warnings: [
      sd.warnUser(input.appUser),
      sd.warnSpringFiles(input.installDir, input.jarName, input.appUser),
      sd.warnEnvFile(env, `/etc/${app}`),
      sd.warnReload(app),
      sd.warnVerify(path),
      sd.warnJavaUpgrade,
    ],
  };
}

function springEnv(input: GuideInput): OutputFile {
  const lines: FileLine[] = [];
  if (input.springProfile) {
    lines.push({
      text: `SPRING_PROFILES_ACTIVE=${input.springProfile}`,
      explain: sd.envProfile(input.springProfile),
    });
  }
  lines.push(
    {
      text: `JAVA_OPTS="${javaOptsWithOom(input.javaOpts).join(' ')}"`,
      explain: sd.envJavaOpts,
    },
    { text: `SERVER_PORT=${input.appPort}`, explain: sd.envPort(input.appPort) },
    { text: 'SERVER_ADDRESS=127.0.0.1', explain: sd.envAddress },
    { text: 'SERVER_FORWARD_HEADERS_STRATEGY=framework', explain: sd.envForward },
    { text: '# SPRING_DATASOURCE_PASSWORD=', explain: sd.envSecret },
  );
  return {
    name: envFilePath(input.appName),
    language: 'properties',
    comment: '#',
    lines,
  };
}

export function systemdSpring(input: GuideInput): GeneratorResult {
  const errors = validateSystemdSpring(input);
  if (errors.length) return { errors };
  return [springUnit(input), springEnv(input)];
}

export function validateSystemdTomcat(input: GuideInput): string[] {
  return checkTomcatLayout(input);
}

export function systemdTomcat(input: GuideInput): GeneratorResult {
  const errors = validateSystemdTomcat(input);
  if (errors.length) return { errors };
  const home = catalinaHome(input);
  const base = input.catalinaBase;
  const path = '/etc/systemd/system/tomcat.service';
  const writable = ['logs', 'temp', 'work', 'webapps'].map((d) => `${base}/${d}`).join(' ');
  return [
    {
      name: path,
      language: 'ini',
      comment: '#',
      lines: [
        ...unitHead({ text: 'Description=Apache Tomcat', explain: sd.descriptionTomcat }),
        ...user(input.tomcatUser),
        {
          text: `Environment=CATALINA_HOME=${home}`,
          explain: `${sd.envHome(home)}。${sd.javaHomeNote}`,
        },
        { text: `Environment=CATALINA_BASE=${base}`, explain: sd.envBase(base) },
        { text: `ExecStart=${home}/bin/catalina.sh run`, explain: sd.execStartTomcat(home) },
        ...lifecycle({ text: 'TimeoutStopSec=30s', explain: sd.timeoutStopTomcat }),
        ...hardening({ text: `ReadWritePaths=${writable}`, explain: sd.readWriteTomcat(base) }),
        ...install,
      ],
      warnings: [
        sd.warnUser(input.tomcatUser),
        sd.warnTomcatOwner(base, input.tomcatUser),
        sd.warnReload('tomcat'),
        sd.warnVerify(path),
        sd.warnTomcatUpgrade(input.tomcatRoot),
      ],
    },
  ];
}

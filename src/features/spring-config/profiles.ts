// プロファイル: application-<名前>.yml の分け方と、spring.profiles.active の指定のしかた。DOM 非依存
import type { OutputFile } from '../../core/fileOutput';
import { strings } from './strings';

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
/** 一度に扱うプロファイルの数の上限 */
export const MAX_PROFILES = 10;

/** 名前の並び（空白・カンマ・読点で区切る）を読む */
export function parseProfileNames(text: string): { names: string[]; errors: string[] } {
  const s = strings.profiles;
  const names: string[] = [];
  const errors: string[] = [];
  for (const name of text.split(/[\s,、]+/).filter((n) => n !== '')) {
    if (!NAME_RE.test(name)) errors.push(s.invalidName(name));
    else if (name === 'default') errors.push(s.defaultName);
    else if (names.includes(name)) errors.push(s.duplicateName(name));
    else names.push(name);
  }
  if (names.length === 0 && errors.length === 0) errors.push(s.noNames);
  return { names: names.slice(0, MAX_PROFILES), errors };
}

/** ログを詳しくする例にするプロファイルか（手元・開発用らしい名前） */
const isDevLike = (name: string) => /local|dev/i.test(name);

/** application.yml と application-<名前>.yml（各行の説明付き） */
export function profileFiles(names: readonly string[]): OutputFile[] {
  const s = strings.profiles;
  const first = names[0];
  const common: OutputFile = {
    name: 'application.yml',
    language: 'yaml',
    comment: '#',
    lines: [
      { text: 'spring:', explain: s.commonExplain },
      { text: '  application:' },
      { text: '    name: app', explain: s.nameExplain },
      ...(first
        ? [{ text: '  profiles:' }, { text: `    default: ${first}`, explain: s.defaultExplain(first) }]
        : []),
    ],
  };
  return [
    common,
    ...names.map(
      (name): OutputFile => ({
        name: `application-${name}.yml`,
        language: 'yaml',
        comment: '#',
        lines: [
          { text: 'logging:', explain: s.profileExplain(name) },
          { text: '  level:' },
          { text: `    root: ${isDevLike(name) ? 'DEBUG' : 'INFO'}` },
        ],
      }),
    ),
  ];
}

export type ActivationId = keyof typeof strings.profiles.commands;

export interface Activation {
  id: ActivationId;
  label: string;
  code: string;
  note: string;
}

/** プロファイルを有効にする方法（jar・環境変数・compose・Maven・Gradle・VS Code） */
export function activations(profile: string): Activation[] {
  const c = strings.profiles.commands;
  const codes: Record<ActivationId, string> = {
    jar: `java -jar app.jar --spring.profiles.active=${profile}`,
    envBash: `SPRING_PROFILES_ACTIVE=${profile} java -jar app.jar`,
    envPowershell: `$env:SPRING_PROFILES_ACTIVE = '${profile}'; java -jar app.jar`,
    compose: ['environment:', `  SPRING_PROFILES_ACTIVE: ${profile}`].join('\n'),
    mavenBash: `./mvnw spring-boot:run -Dspring-boot.run.profiles=${profile}`,
    mavenPowershell: `.\\mvnw spring-boot:run "-Dspring-boot.run.profiles=${profile}"`,
    gradleBash: `./gradlew bootRun --args='--spring.profiles.active=${profile}'`,
    gradlePowershell: `.\\gradlew bootRun --args='--spring.profiles.active=${profile}'`,
    vscode: [
      '{',
      '  "type": "java",',
      `  "name": "Spring Boot (${profile})",`,
      '  "request": "launch",',
      '  "mainClass": "com.example.Application",',
      `  "args": "--spring.profiles.active=${profile}"`,
      '}',
    ].join('\n'),
  };
  return (Object.keys(codes) as ActivationId[]).map((id) => ({
    id,
    label: c[id].label,
    note: c[id].note,
    code: codes[id],
  }));
}

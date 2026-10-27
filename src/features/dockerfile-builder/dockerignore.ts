// .dockerignore の行を組み立てる。DOM 非依存
import { ignoreEx } from './explainStrings';
import { GRADLE_JAR, MAVEN_JAR } from './java';
import { normalizeDir } from './node';
import type { DockerfileInput, Step } from './types';

const VCS = ['.git/', '.gitignore', '.idea/', '.vscode/', '*.iml'];
const SECRETS = ['.env', '.env.*'];
/** 鍵・証明書・ツールの認証情報（ビルドの段階のレイヤーにも入れない） */
const CREDENTIALS = [
  '.npmrc',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  '*.jks',
  'id_rsa*',
  'id_ed25519*',
  'settings.xml',
  '.aws/',
  '.ssh/',
];
const LOGS = ['*.log', 'coverage/', '.DS_Store', 'Thumbs.db'];

const block = (key: string, lines: string[], explain: string): Step => ({
  key,
  text: lines.join('\n'),
  explain,
});

export function dockerignoreSteps(input: DockerfileInput): Step[] {
  if (input.kind !== 'node' && !input.buildInDocker) {
    // 手元でビルドした jar だけを送る（許可するものを並べる形）
    const jar = input.kind === 'java-maven' ? MAVEN_JAR : GRADLE_JAR;
    return [
      { key: 'all', text: '*', explain: ignoreEx.allowAll },
      { key: 'allow-jar', text: `!${jar}`, explain: ignoreEx.allowJar(jar) },
    ];
  }
  const steps: Step[] = [block('vcs', VCS, ignoreEx.vcs)];
  if (input.kind === 'java-maven') steps.push(block('out', ['target/'], ignoreEx.mavenOut));
  if (input.kind === 'java-gradle') {
    steps.push(block('out', ['build/', '.gradle/'], ignoreEx.gradleOut));
  }
  if (input.kind === 'node') {
    steps.push(block('node-modules', ['node_modules/'], ignoreEx.nodeModules));
    if (input.buildInDocker) {
      const dir = normalizeDir(input.nodeOutDir);
      steps.push(block('out', [`${dir}/`], ignoreEx.nodeOut(`${dir}/`)));
    }
  }
  // Gradle は gradle.properties（org.gradle.jvmargs など）をビルドに使うため除かない（認証情報は書かない注意を出す）
  const credentials =
    input.kind === 'java-gradle' ? CREDENTIALS : [...CREDENTIALS, 'gradle.properties'];
  steps.push(
    block('secrets', SECRETS, ignoreEx.secrets),
    block('credentials', credentials, ignoreEx.credentials),
    block('logs', LOGS, ignoreEx.logs),
  );
  return steps;
}

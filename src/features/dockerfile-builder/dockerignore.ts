// .dockerignore の行を組み立てる。DOM 非依存
import { ignoreEx } from './explainStrings';
import { GRADLE_JAR, MAVEN_JAR } from './java';
import { normalizeDir } from './node';
import type { DockerfileInput, Step } from './types';

const VCS = ['.git/', '.gitignore', '.idea/', '.vscode/', '*.iml'];
const SECRETS = ['.env', '.env.*'];
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
  steps.push(block('secrets', SECRETS, ignoreEx.secrets), block('logs', LOGS, ignoreEx.logs));
  return steps;
}

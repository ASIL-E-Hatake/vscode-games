// L2 の追加チェック（content/container/compose-services.yaml。スキーマで表せないもの）
import { CONTAINER_IMAGE_IDS } from '../../core/containerImages';
import type { ComposeServicesFile, ServiceDef } from './types';
import { templateNames } from './yamlText';

/** その部品のテンプレートで使える {…} の名前 */
function allowedNames(def: ServiceDef): Set<string> {
  const names = new Set(['service', 'port', 'hostPort', 'databaseService']);
  for (const p of def.ports) {
    names.add(`port.${p.id}`);
    names.add(`hostPort.${p.id}`);
  }
  for (const f of def.fields ?? []) names.add(f);
  return names;
}

export function checkComposeServicesFile(data: unknown): string[] {
  const file = data as ComposeServicesFile;
  const errors: string[] = [];
  const ids = new Set<string>();
  const images: readonly string[] = CONTAINER_IMAGE_IDS;
  for (const def of file.services) {
    const at = (msg: string) => errors.push(`${def.id}: ${msg}`);
    if (ids.has(def.id)) at('id が重複しています');
    ids.add(def.id);
    if (def.id === 'app') at('id「app」はアプリのサービス名のため使えません');
    if (!images.includes(def.image)) at(`image「${def.image}」が images.yaml の id にありません`);

    const portIds = def.ports.map((p) => p.id);
    if (new Set(portIds).size !== portIds.length) at('ports の id が重複しています');

    const allowed = allowedNames(def);
    const templates = [
      ...(def.environment ?? []).flatMap((e) => [e.value, e.explain ?? '']),
      ...(def.connect?.spring ?? []).flatMap((e) => [e.value, e.explain ?? '']),
      ...(def.connect?.node ?? []).flatMap((e) => [e.value, e.explain ?? '']),
      ...(def.connect?.host ?? []).map((h) => h.value),
      ...(def.healthcheck?.test ?? []),
    ];
    for (const t of templates) {
      for (const name of templateNames(t)) {
        if (!allowed.has(name)) at(`「${t}」の {${name}} は使えません（fields・ports を確かめる）`);
      }
    }
    if (def.fields?.includes('password') && !def.passwordEnv) {
      at('fields に password があるときは passwordEnv を書いてください');
    }
    if (def.passwordEnv && !def.fields?.includes('password')) {
      at('passwordEnv は fields に password があるときだけ書けます');
    }
    if (def.initDir && def.kind !== 'database') at('initDir は database の部品だけに書けます');
    for (const list of [def.environment, def.connect?.spring, def.connect?.node]) {
      const names = (list ?? []).map((e) => e.name);
      for (const n of names.filter((x, i) => names.indexOf(x) !== i)) {
        at(`環境変数 ${n} が重複しています`);
      }
    }
  }
  return errors;
}

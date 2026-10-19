// content/ の YAML / JSON を検証し、dist/content/<種類>.json に変換する
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONTENT_KINDS, validateKind } from './content';

const contentRoot = 'content';
const outDir = join('dist', 'content');
mkdirSync(outDir, { recursive: true });

let failed = false;
for (const kind of CONTENT_KINDS) {
  const results = validateKind(contentRoot, kind);
  for (const r of results) {
    for (const error of r.errors) {
      console.error(`✘ ${r.file}: ${error}`);
      failed = true;
    }
  }
  const files = results
    .filter((r) => r.errors.length === 0)
    .map((r) => ({ file: r.file, data: kind.toDist ? kind.toDist(r.data) : r.data }));
  writeFileSync(join(outDir, `${kind.dir}.json`), JSON.stringify(files));
}

if (failed) {
  console.error('コンテンツの検証に失敗しました');
  process.exit(1);
}
console.log(`コンテンツを ${outDir} に出力しました`);

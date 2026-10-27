// Spring Boot のプロパティのキー（spring.datasource.url・my.list[0].name・map[a.b]）を部品に分ける。DOM 非依存

/** キーの部品。name: 名前 / index: リストの番号 [0] / map: マップのキーのブラケット記法 [a.b] */
export type KeySegment =
  { kind: 'name'; name: string } | { kind: 'index'; index: number } | { kind: 'map'; key: string };

/** properties の 1 項目（キーと文字列の値） */
export interface PropEntry {
  key: string;
  value: string;
  /** 画面の「説明」の列に出す文（変換の注意・推測の元の名前など） */
  explain?: string;
}

/** 1 つの文書（properties の #--- ・YAML の --- で区切られたまとまり） */
export interface ConfigDoc {
  entries: PropEntry[];
}

/** キーを部品に分ける。形が正しくない（空の名前・閉じていない [ など）ときは undefined */
export function parseKey(key: string): KeySegment[] | undefined {
  const segments: KeySegment[] = [];
  let i = 0;
  // 直前が区切り（先頭・'.'）で、名前が来るはずか
  let expectName = true;
  while (i < key.length) {
    const c = key[i]!;
    if (c === '[') {
      const end = key.indexOf(']', i + 1);
      if (end < 0 || segments.length === 0) return undefined;
      const inner = key.slice(i + 1, end);
      if (inner === '') return undefined;
      segments.push(
        /^\d+$/.test(inner) ? { kind: 'index', index: Number(inner) } : { kind: 'map', key: inner },
      );
      i = end + 1;
      expectName = false;
      if (i < key.length && key[i] !== '.' && key[i] !== '[') return undefined;
      continue;
    }
    if (c === '.') {
      if (expectName) return undefined;
      expectName = true;
      i++;
      continue;
    }
    if (!expectName) return undefined;
    let end = i;
    while (end < key.length && key[end] !== '.' && key[end] !== '[') end++;
    segments.push({ kind: 'name', name: key.slice(i, end) });
    expectName = false;
    i = end;
  }
  if (expectName || segments.length === 0) return undefined;
  return segments;
}

/** 部品をキーに戻す（YAML から properties にするときの Spring の平らにし方と同じ） */
export function joinKey(segments: readonly KeySegment[]): string {
  return segments
    .map((s, i) => {
      if (s.kind === 'index') return `[${s.index}]`;
      if (s.kind === 'map') return `[${s.key}]`;
      return i === 0 ? s.name : `.${s.name}`;
    })
    .join('');
}

/**
 * YAML の入れ子のキーをつなぐ（Spring の YamlProcessor と同じ: '[' で始まるキーは '.' を付けずにつなぐ）
 */
export function appendYamlKey(path: string, key: string): string {
  if (path === '') return key;
  return key.startsWith('[') ? `${path}${key}` : `${path}.${key}`;
}

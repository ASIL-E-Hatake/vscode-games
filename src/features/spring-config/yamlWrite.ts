// properties の項目（平らなキー）を入れ子の YAML（application.yml）にする。DOM 非依存
import type { FileLine } from '../../core/fileOutput';
import { joinKey, parseKey, type ConfigDoc, type KeySegment, type PropEntry } from './keyPath';
import { strings } from './strings';
import { isYaml11Bool, yamlKey, yamlValue } from './yamlScalar';

type TreeNode = MapNode | ListNode | LeafNode;
interface MapNode {
  type: 'map';
  children: Map<string, TreeNode>;
}
interface ListNode {
  type: 'list';
  items: (TreeNode | undefined)[];
}
interface LeafNode {
  type: 'leaf';
  entry: PropEntry;
}

const newMap = (): MapNode => ({ type: 'map', children: new Map() });

/** 部品を YAML のマップのキーにする（[a.b] はブラケットのまま。Spring がそのままつなぐ） */
const mapKeyOf = (s: KeySegment) =>
  s.kind === 'name' ? s.name : `[${s.kind === 'map' ? s.key : s.index}]`;

export interface YamlBuild {
  lines: FileLine[];
  warnings: string[];
}

/** 項目を木に入れる。形がぶつかる（a=1 と a.b=2 など）ときは後の項目を残して注意する */
function insert(root: MapNode, entry: PropEntry, warnings: string[]): void {
  const segments = parseKey(entry.key);
  if (!segments) {
    warnings.push(strings.convert.badKey(entry.key));
    root.children.set(entry.key, { type: 'leaf', entry });
    return;
  }
  let node: MapNode | ListNode = root;
  segments.forEach((segment, i) => {
    const last = i === segments.length - 1;
    const next = segments[i + 1];
    const make = (): TreeNode =>
      last
        ? { type: 'leaf', entry }
        : next?.kind === 'index'
          ? { type: 'list', items: [] }
          : newMap();
    const fits = (child: TreeNode | undefined): child is TreeNode =>
      !!child && !last && (next?.kind === 'index' ? child.type === 'list' : child.type === 'map');

    let child: TreeNode | undefined;
    if (node.type === 'list') {
      const index = segment.kind === 'index' ? segment.index : 0;
      child = node.items[index];
      if (!fits(child)) {
        if (child) warnings.push(strings.convert.shapeConflict(joinKey(segments.slice(0, i + 1))));
        child = make();
        node.items[index] = child;
      }
    } else {
      const key = mapKeyOf(segment);
      child = node.children.get(key);
      if (!fits(child)) {
        if (child) warnings.push(strings.convert.shapeConflict(joinKey(segments.slice(0, i + 1))));
        child = make();
        node.children.set(key, child);
      }
    }
    if (child.type !== 'leaf') node = child;
  });
}

const indent = (lines: FileLine[], prefix: string, first = prefix): FileLine[] =>
  lines.map((l, i) => ({ ...l, text: `${i === 0 ? first : prefix}${l.text}` }));

interface EmitContext {
  warnings: string[];
  path: string;
  quotedBool: boolean;
}

function scalar(entry: PropEntry, ctx: EmitContext): string {
  const text = yamlValue(entry.value);
  if (isYaml11Bool(entry.value)) ctx.quotedBool = true;
  return text;
}

function emitMap(node: MapNode, ctx: EmitContext): FileLine[] {
  const lines: FileLine[] = [];
  for (const [key, child] of node.children) {
    const k = yamlKey(key);
    if (child.type === 'leaf') {
      lines.push({ text: `${k}: ${scalar(child.entry, ctx)}`, explain: child.entry.explain });
    } else if (child.type === 'map') {
      lines.push({ text: `${k}:` }, ...indent(emitMap(child, ctx), '  '));
    } else {
      lines.push({ text: `${k}:` }, ...indent(emitList(child, ctx), '  '));
    }
  }
  return lines;
}

function emitList(node: ListNode, ctx: EmitContext): FileLine[] {
  const lines: FileLine[] = [];
  for (let i = 0; i < node.items.length; i++) {
    const item = node.items[i];
    if (!item) {
      ctx.warnings.push(strings.convert.listGap(i));
      lines.push({ text: "- ''" });
    } else if (item.type === 'leaf') {
      lines.push({ text: `- ${scalar(item.entry, ctx)}`, explain: item.entry.explain });
    } else if (item.type === 'map') {
      lines.push(...indent(emitMap(item, ctx), '  ', '- '));
    } else {
      lines.push({ text: '-' }, ...indent(emitList(item, ctx), '  '));
    }
  }
  return lines;
}

/**
 * 文書を YAML の行にする。2 つ目からの文書は --- で区切る（区切りの行の説明に headings を出す）。
 * 値は Spring が同じ文字列として読む形で書く（必要なものだけ引用）
 */
export function yamlLines(docs: readonly ConfigDoc[], headings: readonly string[] = []): YamlBuild {
  const ctx: EmitContext = { warnings: [], path: '', quotedBool: false };
  const lines: FileLine[] = [];
  docs.forEach((doc, i) => {
    if (i > 0) lines.push({ text: '---', explain: headings[i] });
    const root = newMap();
    for (const entry of doc.entries) insert(root, entry, ctx.warnings);
    lines.push(...emitMap(root, ctx));
  });
  const warnings = [...new Set(ctx.warnings)];
  if (ctx.quotedBool) warnings.push(strings.convert.yaml11Quoted);
  return { lines, warnings };
}

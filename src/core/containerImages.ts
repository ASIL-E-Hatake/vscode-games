// コンテナのベースイメージと版（content/container/images.yaml。docs/10-container-tools.md 3.3）。
// dockerfile-builder・compose-builder が共用する。vscode・DOM に依存しない（Webview・テストでも使える）。
//
// 外部通信をしないため、タグは自動で最新にならない。リリース準備（/release-prep）のときに見直し、reviewed を更新する。

/** ビルド済みコンテンツの名前（dist/content/container-images.json。ContentStore.load に渡す） */
export const CONTAINER_IMAGES_CONTENT = 'container-images';

/** 生成器が使うイメージの ID（images.yaml に必ずあることを L2 で検査する） */
export const CONTAINER_IMAGE_IDS = [
  'temurin-jdk',
  'temurin-jre',
  'maven',
  'gradle',
  'node',
  'postgres',
  'mysql',
  'redis',
  'mailpit',
  'adminer',
] as const;
export type ContainerImageId = (typeof CONTAINER_IMAGE_IDS)[number];

/** 版が 1 つだけのイメージの版のキー */
export const SINGLE_VERSION_KEY = 'default';

export interface ContainerImage {
  id: string;
  /** 表示名（例: 'Eclipse Temurin（JDK）'） */
  name: string;
  /** 版 → イメージ名:タグ（例: { '21': 'eclipse-temurin:21-jdk' }）。版が 1 つなら { default: 'postgres:17' } */
  versions: Record<string, string>;
  /** 既定の版（versions のキー）。版が 2 つ以上あるときは必須 */
  defaultVersion?: string;
  /** 補足（latest タグを使う理由など） */
  note?: string;
}

export interface ContainerImagesFile {
  version: 1;
  /** 最後に版を見直した日（YYYY-MM-DD。画面の下に「版の情報は 〇〇 時点」と出す） */
  reviewed: string;
  images: ContainerImage[];
}

/** ContentStore.load の結果（ファイルの一覧）を 1 つにまとめる。reviewed は最も古い日 */
export function mergeImageFiles(files: readonly ContainerImagesFile[]): ContainerImagesFile {
  const reviewed = files.map((f) => f.reviewed).sort()[0] ?? '';
  return { version: 1, reviewed, images: files.flatMap((f) => f.images) };
}

export function findImage(file: ContainerImagesFile, id: string): ContainerImage | undefined {
  return file.images.find((i) => i.id === id);
}

/** 既定の版（defaultVersion。無ければ最初の版） */
export function defaultVersionOf(image: ContainerImage): string {
  return image.defaultVersion ?? Object.keys(image.versions)[0] ?? SINGLE_VERSION_KEY;
}

/** 選べる版（新しい順。数字の版は大きい順、それ以外はそのまま） */
export function versionsOf(image: ContainerImage): string[] {
  return Object.keys(image.versions).sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    return Number.isNaN(na) || Number.isNaN(nb) ? 0 : nb - na;
  });
}

/**
 * イメージ名:タグを返す（例: imageRef(file, 'temurin-jre', '21') → 'eclipse-temurin:21-jre'）。
 * version を省略すると既定の版。イメージ・版が無ければ undefined
 */
export function imageRef(
  file: ContainerImagesFile,
  id: string,
  version?: string,
): string | undefined {
  const image = findImage(file, id);
  if (!image) return undefined;
  return image.versions[version ?? defaultVersionOf(image)];
}

/** L2 の追加チェック（スキーマで表せないもの）。エラーメッセージの配列を返す */
export function checkContainerImagesFile(data: unknown): string[] {
  const file = data as ContainerImagesFile;
  const errors: string[] = [];
  const date = new Date(`${file.reviewed}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== file.reviewed) {
    errors.push(`reviewed が正しい日付ではありません: ${file.reviewed}`);
  }
  const seen = new Set<string>();
  for (const image of file.images) {
    if (seen.has(image.id)) errors.push(`id が重複しています: ${image.id}`);
    seen.add(image.id);
    const keys = Object.keys(image.versions);
    if (keys.length > 1 && image.defaultVersion === undefined) {
      errors.push(`${image.id}: 版が 2 つ以上あるときは defaultVersion を書いてください`);
    }
    if (image.defaultVersion !== undefined && !keys.includes(image.defaultVersion)) {
      errors.push(`${image.id}: defaultVersion「${image.defaultVersion}」が versions にありません`);
    }
    for (const [version, ref] of Object.entries(image.versions)) {
      if (ref.endsWith(':latest') && !image.note) {
        errors.push(`${image.id}: ${version} が latest タグのときは note に理由を書いてください`);
      }
    }
  }
  for (const id of CONTAINER_IMAGE_IDS) {
    if (!seen.has(id)) errors.push(`生成器が使うイメージがありません: ${id}`);
  }
  return errors;
}

// 実行環境の版とサポート終了日（content/runtime/versions.yaml）と、「今の版」の判定。DOM・VS Code API 非依存。
// 設計は docs/11-v090-runtime-guide.md 2.3。今日の日付は引数で受け取る（テストで境界を固定するため）。
// 判定はローカルだけで行い、通信しない。脆弱性（CVE）の一覧は持たない（公式のセキュリティ情報へのリンクを出す）。

/** ビルド済みコンテンツの名前（dist/content/runtime-versions.json） */
export const RUNTIME_VERSIONS_CONTENT = 'runtime-versions';

export type ProductId = 'node' | 'java' | 'tomcat' | 'nginx' | 'spring-boot';
export const PRODUCT_IDS: readonly ProductId[] = ['node', 'java', 'tomcat', 'nginx', 'spring-boot'];

export interface VersionBranch {
  /** 系統（Node・Java はメジャー版 '22'、Tomcat・Nginx・Spring Boot は '10.1' のような major.minor） */
  id: string;
  /** サポート終了日（YYYY-MM-DD、または月までの YYYY-MM = その月の末日まで） */
  eol?: string;
  /** eol は「少なくともこの日まで」（延びることがある） */
  atLeast?: boolean;
  /** 公式にサポート終了日の発表が無い */
  eolUnknown?: boolean;
  /** 終了と明記されているが日付が無い */
  ended?: boolean;
  note?: string;
}

export interface VersionProduct {
  id: ProductId;
  name: string;
  /** 日付を確かめた公式のページ */
  source: string;
  /** 公式のセキュリティ情報 */
  security: string;
  /** 上げる先として勧める系統 */
  recommended: string;
  /** 一覧に無く、一覧の最も新しい系統より古い版を「サポート終了」と判定する */
  unlistedEnded?: boolean;
  note?: string;
  branches: VersionBranch[];
}

export interface RuntimeVersionsFile {
  version: 1;
  /** 最後に見直した日（YYYY-MM-DD） */
  reviewed: string;
  products: VersionProduct[];
}

/** 判定の結果。ended: サポート終了済み / ending-soon: 6 か月以内に終了 / supported: サポート中 / unknown: 不明 */
export type SupportStatus = 'ended' | 'ending-soon' | 'supported' | 'unknown';

/** 「もうすぐ終了」とする期間（か月） */
export const ENDING_SOON_MONTHS = 6;

// ---- 日付 ----

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

/** YYYY-MM-DD / YYYY-MM を、その日（月なら末日）の UTC の 0 時に。不正なら undefined */
export function eolDate(eol: string): Date | undefined {
  const day = DAY_RE.exec(eol);
  if (day) {
    const d = new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3])));
    return d.toISOString().slice(0, 10) === eol ? d : undefined;
  }
  const month = MONTH_RE.exec(eol);
  if (month) {
    const m = Number(month[2]);
    if (m < 1 || m > 12) return undefined;
    // 翌月の 0 日 = その月の末日
    return new Date(Date.UTC(Number(month[1]), m, 0));
  }
  return undefined;
}

/** 日付（時刻を切り捨てた UTC の 0 時）。today は利用者の「今日」（ローカルの日付）を YYYY-MM-DD で渡す */
function dayOf(today: string): Date {
  const d = eolDate(today);
  if (!d || !DAY_RE.test(today)) throw new Error(`今日の日付が正しくありません: ${today}`);
  return d;
}

/** n か月後の同じ日（無い日は月末に寄せる） */
export function addMonths(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(date.getUTCDate(), lastDay)));
}

/** Date を YYYY-MM-DD に */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** ローカルの今日（YYYY-MM-DD） */
export function localToday(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

// ---- 版の比較 ----

/** '10.1' と '9.0' のような版を数値の並びで比べる（a < b なら負） */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** 系統の深さ（Node・Java はメジャー版だけ、ほかは major.minor） */
const BRANCH_DEPTH: Record<ProductId, number> = {
  node: 1,
  java: 1,
  tomcat: 2,
  nginx: 2,
  'spring-boot': 2,
};

export function branchOf(product: ProductId, version: string): string {
  return version.split('.').slice(0, BRANCH_DEPTH[product]).join('.');
}

// ---- 貼り付けた出力から版を読む ----

export interface DetectedVersion {
  product: ProductId;
  /** 読み取った版（例: '20.11.1'・'21.0.4'・'10.1.48'） */
  version: string;
  /** 読み取った元の行（画面に出す） */
  line: string;
}

/** Java の版の文字列（"1.8.0_392"・"21.0.4"・"17"）を、メジャー版から始まる形（8.0.392・21.0.4）に */
function normalizeJava(raw: string): string {
  const legacy = /^1\.(\d+)(?:\.(\d+))?(?:_(\d+))?/.exec(raw);
  if (legacy) return [legacy[1], legacy[2] ?? '0', legacy[3]].filter((x) => x !== undefined).join('.');
  return /^\d+(?:\.\d+)*/.exec(raw)?.[0] ?? raw;
}

interface Pattern {
  product: ProductId;
  re: RegExp;
  map?: (m: RegExpExecArray) => string;
}

const PATTERNS: Pattern[] = [
  // node -v（v22.11.0）・node --version
  { product: 'node', re: /^\s*v(\d+\.\d+\.\d+)\s*$/ },
  { product: 'node', re: /\bnode(?:js)?[\s/:-]+v?(\d+\.\d+\.\d+)/i },
  // java -version（openjdk version "21.0.4" 2024-07-16 LTS / java version "1.8.0_392"）
  {
    product: 'java',
    re: /\b(?:openjdk|java) version "([^"]+)"/i,
    map: (m) => normalizeJava(m[1]!),
  },
  // java --version（openjdk 21.0.4 2024-07-16 LTS）
  { product: 'java', re: /^\s*(?:openjdk|java) (\d+(?:\.\d+)*)\b/i },
  // catalina.sh version / version.sh の JVM Version: 21.0.4+7-LTS
  { product: 'java', re: /^\s*JVM Version:\s*([\d._]+)/i, map: (m) => normalizeJava(m[1]!) },
  // catalina.sh version（Server version: Apache Tomcat/10.1.48）
  { product: 'tomcat', re: /Apache Tomcat\/(\d+\.\d+\.\d+)/i },
  // nginx -v（nginx version: nginx/1.24.0）
  { product: 'nginx', re: /\bnginx\/(\d+\.\d+\.\d+)/i },
  // Spring Boot の起動時の表示（:: Spring Boot ::  (v3.3.5) / Running with Spring Boot v3.3.5）
  { product: 'spring-boot', re: /Spring Boot[\s:]*\(?v(\d+\.\d+\.\d+)/i },
];

/** 貼り付けた出力（node -v・java -version・catalina.sh version・nginx -v・Spring Boot の起動ログ）から版を読み取る */
export function detectVersions(text: string): DetectedVersion[] {
  const found: DetectedVersion[] = [];
  const seen = new Set<string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    for (const p of PATTERNS) {
      const m = p.re.exec(line);
      if (!m) continue;
      const version = p.map ? p.map(m) : m[1]!;
      const key = `${p.product}:${version}`;
      if (!seen.has(key)) {
        seen.add(key);
        found.push({ product: p.product, version, line });
      }
      break;
    }
  }
  return found;
}

// ---- 判定 ----

export interface VersionJudgement {
  product: ProductId;
  productName: string;
  version: string;
  branch: string;
  status: SupportStatus;
  /** サポート終了日（データの書き方のまま。YYYY-MM-DD / YYYY-MM） */
  eol?: string;
  atLeast?: boolean;
  /** 一覧に無い版（古いため終了と判定した・新しくて分からない） */
  unlisted?: boolean;
  note?: string;
  /** 上げる先として勧める系統（今の系統が勧める系統でなく、終了済み・もうすぐ終了・不明のとき） */
  recommend?: string;
  security: string;
  source: string;
}

export function findProduct(file: RuntimeVersionsFile, id: ProductId): VersionProduct | undefined {
  return file.products.find((p) => p.id === id);
}

/** 系統のサポートの状態（today は YYYY-MM-DD） */
export function branchStatus(branch: VersionBranch, today: string): SupportStatus {
  if (branch.ended) return 'ended';
  if (branch.eolUnknown || !branch.eol) return 'unknown';
  const eol = eolDate(branch.eol);
  if (!eol) return 'unknown';
  const now = dayOf(today);
  // eol の日まではサポート中
  if (now.getTime() > eol.getTime()) return branch.atLeast ? 'unknown' : 'ended';
  if (eol.getTime() <= addMonths(now, ENDING_SOON_MONTHS).getTime()) return 'ending-soon';
  return 'supported';
}

/** 1 つの版を判定する */
export function judgeVersion(
  file: RuntimeVersionsFile,
  detected: Pick<DetectedVersion, 'product' | 'version'>,
  today: string,
): VersionJudgement | undefined {
  const product = findProduct(file, detected.product);
  if (!product) return undefined;
  const branchId = branchOf(product.id, detected.version);
  const branch = product.branches.find((b) => b.id === branchId);
  const base = {
    product: product.id,
    productName: product.name,
    version: detected.version,
    branch: branchId,
    security: product.security,
    source: product.source,
  };
  let result: VersionJudgement;
  if (branch) {
    result = {
      ...base,
      status: branchStatus(branch, today),
      ...(branch.eol ? { eol: branch.eol } : {}),
      ...(branch.atLeast ? { atLeast: true } : {}),
      ...(branch.note ? { note: branch.note } : {}),
    };
  } else {
    const newest = product.branches
      .map((b) => b.id)
      .sort(compareVersions)
      .at(-1);
    const older = newest !== undefined && compareVersions(branchId, newest) < 0;
    result = {
      ...base,
      status: older && product.unlistedEnded ? 'ended' : 'unknown',
      unlisted: true,
    };
  }
  if (result.status !== 'supported' && branchId !== product.recommended) {
    result.recommend = product.recommended;
  }
  return result;
}

/** 貼り付けた出力をまとめて判定する */
export function judgeText(
  file: RuntimeVersionsFile,
  text: string,
  today: string,
): VersionJudgement[] {
  return detectVersions(text).flatMap((d) => {
    const j = judgeVersion(file, d, today);
    return j ? [j] : [];
  });
}

// ---- データの検査（L2） ----

/** versions.yaml の追加の検査（スキーマで表せないもの）。エラーメッセージの配列を返す */
export function checkRuntimeVersionsFile(data: unknown): string[] {
  const file = data as RuntimeVersionsFile;
  const errors: string[] = [];
  if (!DAY_RE.test(file.reviewed) || !eolDate(file.reviewed)) {
    errors.push(`reviewed が正しい日付ではありません: ${file.reviewed}`);
  }
  const seenProducts = new Set<string>();
  for (const product of file.products) {
    if (seenProducts.has(product.id)) errors.push(`製品の id が重複しています: ${product.id}`);
    seenProducts.add(product.id);
    const seen = new Set<string>();
    for (const branch of product.branches) {
      const where = `${product.id} ${branch.id}`;
      if (seen.has(branch.id)) errors.push(`${where}: 系統の id が重複しています`);
      seen.add(branch.id);
      if (branchOf(product.id, `${branch.id}.0.0`) !== branch.id) {
        errors.push(`${where}: 系統の id の形が違います（${BRANCH_DEPTH[product.id]} 段）`);
      }
      const kinds = [branch.eol !== undefined, !!branch.eolUnknown, !!branch.ended].filter(Boolean);
      if (kinds.length !== 1) {
        errors.push(`${where}: eol・eolUnknown・ended のどれか 1 つだけを書いてください`);
      }
      if (branch.eol !== undefined && !eolDate(branch.eol)) {
        errors.push(`${where}: eol が正しい日付ではありません: ${branch.eol}`);
      }
      if ((branch.eolUnknown || branch.atLeast) && !branch.note) {
        errors.push(`${where}: eolUnknown・atLeast のときは note に理由を書いてください`);
      }
      if (branch.atLeast && branch.eol === undefined) {
        errors.push(`${where}: atLeast は eol と一緒に書いてください`);
      }
    }
    const recommended = product.branches.find((b) => b.id === product.recommended);
    if (!recommended) {
      errors.push(`${product.id}: recommended「${product.recommended}」が branches にありません`);
    } else if (eolDate(file.reviewed) && branchStatus(recommended, file.reviewed) === 'ended') {
      errors.push(`${product.id}: recommended「${product.recommended}」はサポートが終わっています`);
    }
  }
  for (const id of PRODUCT_IDS) {
    if (!seenProducts.has(id)) errors.push(`製品がありません: ${id}`);
  }
  return errors;
}

/** コンテナのイメージ（images.yaml の id）と、版の判定に使う製品の対応 */
export const IMAGE_PRODUCTS: Readonly<Record<string, ProductId>> = {
  'temurin-jdk': 'java',
  'temurin-jre': 'java',
  maven: 'java',
  gradle: 'java',
  node: 'node',
};

/**
 * コンテナのイメージ（images.yaml）に、サポートが終わった版が残っていないか（L2）。
 * images は { id, versions: { 版: タグ } } の一覧。版のキーが製品の系統（'21'・'22'）
 */
export function checkImagesSupported(
  images: readonly { id: string; versions: Record<string, string> }[],
  file: RuntimeVersionsFile,
  today: string,
): string[] {
  const errors: string[] = [];
  for (const image of images) {
    const product = IMAGE_PRODUCTS[image.id];
    if (!product) continue;
    for (const [version, ref] of Object.entries(image.versions)) {
      const j = judgeVersion(file, { product, version }, today);
      if (!j || j.status === 'ended') {
        errors.push(
          `${image.id} の ${version}（${ref}）はサポートが終わっています（${j?.eol ?? '一覧に無い版'}）`,
        );
      }
    }
  }
  return errors;
}

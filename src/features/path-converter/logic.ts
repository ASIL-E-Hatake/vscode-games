// パス変換のロジック（DOM・VS Code 非依存）。
// 入力の形式を自動判別して共通の形（ParsedPath）にし、各形式へ書き出す。
// 相対パスの . / .. は整理せずそのまま残す。

/** 入力されたパスの種類 */
export type PathKind =
  | 'drive' // C:\a、C:/a、/mnt/c/a、/c/a、file:///C:/a
  | 'unc' // \\server\share\a、file://server/share/a
  | 'posix' // /home/me/a
  | 'relative'; // a\b、./a/b

export interface ParsedPath {
  kind: PathKind;
  /** drive のときのドライブ文字（小文字） */
  drive?: string;
  /** unc のときのサーバー名・共有名 */
  server?: string;
  share?: string;
  segments: string[];
  /** 末尾が区切り文字で終わっていた（ルート以外） */
  trailing: boolean;
  /** relative のとき、入力が `\` 区切りだった */
  windowsStyle: boolean;
  /** 判別した入力形式の名前（画面に表示する） */
  detected: string;
}

export type ParseResult =
  { ok: true; path: ParsedPath } | { ok: false; reason: 'empty' | 'badUrl' };

export const DETECTED = {
  windows: 'Windows のパス',
  unc: 'Windows のネットワークパス（UNC）',
  wsl: 'WSL のパス（/mnt/c/...）',
  gitBash: 'Git Bash のパス（/c/...）',
  posix: 'Linux のパス',
  url: 'file:// URL',
  relative: '相対パス',
} as const;

/** 前後の空白と、全体を囲む引用符（"C:\a b"）を取り除く */
export function cleanInput(input: string): string {
  let text = input.trim();
  if (text.length >= 2) {
    const first = text[0];
    if ((first === '"' || first === "'") && text.endsWith(first)) {
      text = text.slice(1, -1).trim();
    }
  }
  return text;
}

const splitSegments = (text: string, separators: RegExp): string[] =>
  text.split(separators).filter((s) => s !== '');

const endsWithSeparator = (text: string, separators: RegExp): boolean => {
  const last = text.slice(-1);
  return last !== '' && separators.test(last);
};

const BOTH = /[\\/]/;
const SLASH = /\//;

function drivePath(drive: string, rest: string, separators: RegExp, detected: string): ParsedPath {
  const segments = splitSegments(rest, separators);
  return {
    kind: 'drive',
    drive: drive.toLowerCase(),
    segments,
    trailing: segments.length > 0 && endsWithSeparator(rest, separators),
    windowsStyle: false,
    detected,
  };
}

function uncPath(
  server: string,
  share: string,
  rest: string,
  separators: RegExp,
  detected: string,
): ParsedPath {
  const segments = splitSegments(rest, separators);
  return {
    kind: 'unc',
    server,
    share,
    segments,
    trailing: segments.length > 0 && endsWithSeparator(rest, separators),
    windowsStyle: false,
    detected,
  };
}

/** `/` で始まる絶対パス（WSL の /mnt/c・Git Bash の /c・それ以外の Linux パス）を判別する */
function parseAbsolutePosix(text: string, gitBash: boolean, detectedPosix: string): ParsedPath {
  const wsl = /^\/mnt\/([A-Za-z])(?=\/|$)(.*)$/s.exec(text);
  if (wsl) return drivePath(wsl[1], wsl[2], SLASH, DETECTED.wsl);
  if (gitBash) {
    const bash = /^\/([A-Za-z])(?=\/|$)(.*)$/s.exec(text);
    if (bash) return drivePath(bash[1], bash[2], SLASH, DETECTED.gitBash);
  }
  const segments = splitSegments(text, SLASH);
  return {
    kind: 'posix',
    segments,
    trailing: segments.length > 0 && text.endsWith('/'),
    windowsStyle: false,
    detected: detectedPosix,
  };
}

function parseFileUrl(text: string): ParseResult {
  let rest = text.slice('file:'.length);
  if (!rest.startsWith('//')) return { ok: false, reason: 'badUrl' };
  rest = rest.slice(2);
  const slash = rest.indexOf('/');
  const host = slash === -1 ? rest : rest.slice(0, slash);
  const rawPath = slash === -1 ? '' : rest.slice(slash);
  let path: string;
  try {
    path = decodeURIComponent(rawPath);
  } catch {
    return { ok: false, reason: 'badUrl' };
  }
  if (host !== '' && host.toLowerCase() !== 'localhost') {
    // file://server/share/a → UNC
    const parts = path.replace(/^\/+/, '');
    const next = parts.indexOf('/');
    const share = next === -1 ? parts : parts.slice(0, next);
    const tail = next === -1 ? '' : parts.slice(next);
    return { ok: true, path: uncPath(host, share, tail, SLASH, DETECTED.url) };
  }
  // file:///C:/a → ドライブ
  const drive = /^\/([A-Za-z]):(?=\/|$)(.*)$/s.exec(path);
  if (drive) return { ok: true, path: drivePath(drive[1], drive[2], SLASH, DETECTED.url) };
  if (!path.startsWith('/')) return { ok: false, reason: 'badUrl' };
  // URL の中の /c/... は Linux の c フォルダとして扱う（Git Bash の形式にはしない）
  const parsed = parseAbsolutePosix(path, false, DETECTED.url);
  return { ok: true, path: { ...parsed, detected: DETECTED.url } };
}

/** 入力を解釈する */
export function parsePath(input: string): ParseResult {
  const text = cleanInput(input);
  if (text === '') return { ok: false, reason: 'empty' };

  if (/^file:/i.test(text)) return parseFileUrl(text);

  const drive = /^([A-Za-z]):(?=[\\/]|$)(.*)$/s.exec(text);
  if (drive) return { ok: true, path: drivePath(drive[1], drive[2], BOTH, DETECTED.windows) };

  if (text.startsWith('\\\\')) {
    const rest = text.replace(/^\\{2,}/, '');
    const parts = splitSegments(rest, BOTH);
    const [server, share = '', ...tail] = parts;
    if (server) {
      return {
        ok: true,
        path: {
          kind: 'unc',
          server,
          share,
          segments: tail,
          trailing: tail.length > 0 && endsWithSeparator(rest, BOTH),
          windowsStyle: true,
          detected: DETECTED.unc,
        },
      };
    }
  }

  if (text.startsWith('/')) {
    return { ok: true, path: parseAbsolutePosix(text, true, DETECTED.posix) };
  }

  const segments = splitSegments(text, BOTH);
  return {
    ok: true,
    path: {
      kind: 'relative',
      segments,
      trailing: segments.length > 0 && endsWithSeparator(text, BOTH),
      windowsStyle: text.includes('\\'),
      detected: DETECTED.relative,
    },
  };
}

// ---- 書き出し ----

export type ConversionId =
  | 'windowsBackslash'
  | 'windowsSlash'
  | 'wsl'
  | 'gitBash'
  | 'fileUrl'
  | 'literal'
  | 'bashQuote'
  | 'powershellQuote';

export const CONVERSION_LABELS: Record<ConversionId, string> = {
  windowsBackslash: 'Windows（\\ 区切り）',
  windowsSlash: 'Windows（/ 区切り）',
  wsl: 'WSL（/mnt/c/...）',
  gitBash: 'Git Bash（/c/...）',
  fileUrl: 'file:// URL',
  literal: 'JSON・Java の文字列リテラル',
  bashQuote: 'bash 用（クォート）',
  powershellQuote: 'PowerShell 用（クォート）',
};

export interface Conversion {
  id: ConversionId;
  label: string;
  /** 変換結果。変換できないときは undefined */
  value?: string;
  /** 変換できない理由 */
  reason?: string;
}

const ok = (id: ConversionId, value: string): Conversion => ({
  id,
  label: CONVERSION_LABELS[id],
  value,
});
const ng = (id: ConversionId, reason: string): Conversion => ({
  id,
  label: CONVERSION_LABELS[id],
  reason,
});

/** 区切り文字でつなぐ（ルート以外で末尾が区切りだったら末尾にも付ける） */
function join(root: string, p: ParsedPath, separator: string): string {
  if (p.segments.length === 0) return root;
  const body = p.segments.join(separator);
  return `${root}${body}${p.trailing ? separator : ''}`;
}

/** Windows の書き方。区切りは `\` または `/`。Linux のパスは対応づけられないので undefined */
function windowsForm(p: ParsedPath, separator: '\\' | '/'): string | undefined {
  switch (p.kind) {
    case 'drive': {
      const root = `${(p.drive ?? '').toUpperCase()}:${separator}`;
      return join(root, p, separator);
    }
    case 'unc': {
      const double = separator + separator;
      const head = `${double}${p.server}${p.share ? separator + p.share : ''}`;
      return p.segments.length === 0 ? head : join(head + separator, p, separator);
    }
    case 'relative':
      return join('', p, separator);
    case 'posix':
      return undefined;
  }
}

/** WSL・Linux の書き方（/ 区切り） */
function wslForm(p: ParsedPath): string | undefined {
  switch (p.kind) {
    case 'drive':
      return p.segments.length === 0 ? `/mnt/${p.drive}` : join(`/mnt/${p.drive}/`, p, '/');
    case 'posix':
      return join('/', p, '/');
    case 'relative':
      return join('', p, '/');
    case 'unc':
      return undefined;
  }
}

function gitBashForm(p: ParsedPath): string | undefined {
  switch (p.kind) {
    case 'drive':
      return p.segments.length === 0 ? `/${p.drive}` : join(`/${p.drive}/`, p, '/');
    case 'unc':
      return windowsForm(p, '/');
    case 'relative':
      return join('', p, '/');
    case 'posix':
      return undefined;
  }
}

/** パーセントエンコード（日本語・空白など。ドライブ文字の `:` はそのまま） */
function encodeSegments(segments: string[]): string[] {
  return segments.map((s) => encodeURIComponent(s));
}

function fileUrlForm(p: ParsedPath): string | undefined {
  const encoded: ParsedPath = { ...p, segments: encodeSegments(p.segments) };
  switch (p.kind) {
    case 'drive':
      return join(`file:///${(p.drive ?? '').toUpperCase()}:/`, encoded, '/');
    case 'unc': {
      const head = `file://${p.server}/${encodeURIComponent(p.share ?? '')}`;
      return p.segments.length === 0 ? head : join(`${head}/`, encoded, '/');
    }
    case 'posix':
      return join('file:///', encoded, '/');
    case 'relative':
      return undefined;
  }
}

/** JSON・Java の文字列リテラル（"..." 付き。`\` と `"` をエスケープ） */
export function toStringLiteral(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** bash 用のクォート。安全な文字だけのときはそのまま、それ以外は '...'（中の ' は '\''） */
export function quoteBash(text: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

/** PowerShell 用のクォート。常に '...'（中の ' は ''） */
export function quotePowerShell(text: string): string {
  return `'${text.replace(/'/g, "''")}'`;
}

/** 変換できる形をすべて並べる（できないものは理由付き） */
export function convertPath(p: ParsedPath): Conversion[] {
  const out: Conversion[] = [];
  const windowsReason =
    p.kind === 'posix' ? 'Linux のパスは Windows のドライブ（C:\\）に対応づけられません' : '';
  const win = windowsForm(p, '\\');
  const winSlash = windowsForm(p, '/');
  const wsl = wslForm(p);
  const bash = gitBashForm(p);
  const url = fileUrlForm(p);

  out.push(win !== undefined ? ok('windowsBackslash', win) : ng('windowsBackslash', windowsReason));
  out.push(
    winSlash !== undefined ? ok('windowsSlash', winSlash) : ng('windowsSlash', windowsReason),
  );
  out.push(
    wsl !== undefined
      ? ok('wsl', wsl)
      : ng('wsl', 'ネットワークパス（UNC）は /mnt/ 以下に対応づけられません'),
  );
  out.push(
    bash !== undefined
      ? ok('gitBash', bash)
      : ng(
          'gitBash',
          'Git Bash の /c/... はドライブのパスにだけ対応します（Linux のパスは対応づけられません）',
        ),
  );
  out.push(
    url !== undefined
      ? ok('fileUrl', url)
      : ng('fileUrl', '相対パスは file:// URL にできません（絶対パスにしてください）'),
  );

  // 文字列リテラル・クォートは、そのパスの「ふだんの書き方」に対して行う
  const native = windowsStyleNative(p, win, wsl);
  out.push(ok('literal', toStringLiteral(native)));
  const forBash = wsl ?? bash;
  out.push(
    forBash !== undefined
      ? ok('bashQuote', quoteBash(forBash))
      : ng('bashQuote', 'bash 用の形に変換できません'),
  );
  out.push(ok('powershellQuote', quotePowerShell(native)));
  return out;
}

/** 文字列リテラル・PowerShell 用に使う書き方（Windows のパスは `\` 区切り、Linux のパスはそのまま） */
function windowsStyleNative(
  p: ParsedPath,
  win: string | undefined,
  wsl: string | undefined,
): string {
  if (p.kind === 'posix') return wsl ?? '';
  if (p.kind === 'relative' && !p.windowsStyle) return wsl ?? '';
  return win ?? '';
}

/** 入力文字列から、判別結果と変換結果をまとめて返す */
export type Conversions =
  { ok: true; detected: string; items: Conversion[] } | { ok: false; reason: 'empty' | 'badUrl' };

export function convertInput(input: string): Conversions {
  const parsed = parsePath(input);
  if (!parsed.ok) return parsed;
  return { ok: true, detected: parsed.path.detected, items: convertPath(parsed.path) };
}

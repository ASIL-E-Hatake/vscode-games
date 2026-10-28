// 利用者・チームが用意するファイルの出どころ（共有ファイル・ワークスペース）の場所と変更の監視。
// リンク集（links）と問題パック（content-pack）で共通。
// - 共有ファイル: 設定（例: hatake-gottani.links.sharedFiles）に書かれたパス。変更を自動で検知する
// - ワークスペース: 開いているフォルダの .vscode/<決まったファイル名>。Workspace Trust が信頼済みのときだけ読む
// 外部通信はしない（ローカル・共有フォルダのファイルを読むだけ）
// 守り: 共有ファイルの設定はワークスペースが信頼済みのときだけワークスペースの値を使う
// （package.json の restrictedConfigurations と二重）。読むのは通常のファイルだけ・MAX_SOURCE_FILE_BYTES まで
import { closeSync, existsSync, fstatSync, openSync, readSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join } from 'node:path';
import * as vscode from 'vscode';

/** 設定に書かれたパスを絶対パスにする（~ と ${userHome} を展開。相対パスはワークスペース基準） */
export function resolveSharedPath(raw: string, workspaceDir?: string): string {
  const expanded = raw
    .trim()
    .replace(/^~(?=$|[\\/])/, homedir())
    .replace(/\$\{userHome\}/g, homedir())
    .replace(/\$\{workspaceFolder\}/g, workspaceDir ?? '');
  return isAbsolute(expanded) || !workspaceDir ? expanded : join(workspaceDir, expanded);
}

/** 共有ファイル・ワークスペースのファイルの大きさの上限（1 MB） */
export const MAX_SOURCE_FILE_BYTES = 1024 * 1024;

/** 設定の値の出どころ（vscode.WorkspaceConfiguration.inspect() の結果のうち使う部分） */
export interface SettingInspect<T> {
  defaultValue?: T;
  globalValue?: T;
  workspaceValue?: T;
  workspaceFolderValue?: T;
}

/**
 * 設定の値を決める。信頼していないワークスペースでは、ワークスペース（.vscode/settings.json・
 * .code-workspace）とフォルダの設定の値を使わず、ユーザーの設定か既定値だけを使う
 * （信頼していないワークスペースから任意のファイルを「共有ファイル」として読ませないため）
 */
export function trustedSettingValue<T>(
  inspect: SettingInspect<T> | undefined,
  trusted: boolean,
): T | undefined {
  if (!inspect) return undefined;
  if (trusted) {
    return (
      inspect.workspaceFolderValue ??
      inspect.workspaceValue ??
      inspect.globalValue ??
      inspect.defaultValue
    );
  }
  return inspect.globalValue ?? inspect.defaultValue;
}

export type FileSourceKind = 'shared' | 'workspace';

export interface FileSourcesOptions {
  /** 共有ファイルのパスの一覧を書く設定のキー（例: hatake-gottani.links.sharedFiles） */
  sharedFilesSetting: string;
  /** ワークスペースの .vscode/ に置くファイル名（先に書いたものから探す） */
  workspaceFileNames: readonly string[];
  /** 設定・ファイル・信頼の状態が変わったとき */
  onChange(): void;
  /** ワークスペースが信頼されているか（省略時は vscode.workspace.isTrusted。テストで差し替える） */
  isTrusted?(): boolean;
}

/** 読み込む対象の 1 ファイル */
export interface SourceFile {
  path: string;
  source: FileSourceKind;
}

export class FileSources implements vscode.Disposable {
  private readonly watchers: vscode.Disposable[] = [];
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly options: FileSourcesOptions) {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(options.sharedFilesSetting)) {
          this.watchFiles();
          options.onChange();
        }
      }),
      vscode.workspace.onDidGrantWorkspaceTrust(() => {
        this.watchFiles();
        options.onChange();
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.watchFiles();
        options.onChange();
      }),
    );
    this.watchFiles();
  }

  workspaceDir(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  isTrusted(): boolean {
    return this.options.isTrusted ? this.options.isTrusted() : vscode.workspace.isTrusted;
  }

  sharedFilePaths(): string[] {
    const raw = trustedSettingValue(
      vscode.workspace.getConfiguration().inspect<unknown>(this.options.sharedFilesSetting),
      this.isTrusted(),
    );
    return (Array.isArray(raw) ? raw : [])
      .filter((p): p is string => typeof p === 'string' && p.trim() !== '')
      .map((p) => resolveSharedPath(p, this.workspaceDir()));
  }

  workspaceFilePaths(): string[] {
    return (vscode.workspace.workspaceFolders ?? []).flatMap((folder) =>
      this.options.workspaceFileNames.map((name) => join(folder.uri.fsPath, '.vscode', name)),
    );
  }

  /** 読み込む対象（共有ファイル → ワークスペース。ワークスペースは信頼済みのときだけ・存在するものだけ） */
  files(): SourceFile[] {
    return [
      ...this.sharedFilePaths().map((path) => ({ path, source: 'shared' as const })),
      ...(this.isTrusted()
        ? this.workspaceFilePaths()
            .filter((p) => existsSync(p))
            .map((path) => ({ path, source: 'workspace' as const }))
        : []),
    ];
  }

  /** 信頼されていないため読まなかったワークスペースのファイルがあるか（画面で案内する） */
  untrustedWithFile(): boolean {
    return !this.isTrusted() && this.workspaceFilePaths().some((p) => existsSync(p));
  }

  /** 共有ファイル・ワークスペースのファイルの変更を監視し、変わったら onChange を呼ぶ */
  private watchFiles(): void {
    for (const w of this.watchers.splice(0)) w.dispose();
    const targets = [...this.sharedFilePaths(), ...this.workspaceFilePaths()];
    for (const path of targets) {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(vscode.Uri.file(dirname(path)), basename(path)),
      );
      const changed = () => this.options.onChange();
      this.watchers.push(
        watcher,
        watcher.onDidChange(changed),
        watcher.onDidCreate(changed),
        watcher.onDidDelete(changed),
      );
    }
  }

  dispose(): void {
    for (const d of [...this.watchers, ...this.disposables]) d.dispose();
  }
}

const tooLarge = (bytes: number) =>
  `ファイルが大きすぎます（${(bytes / 1024 / 1024).toFixed(1)} MB。${MAX_SOURCE_FILE_BYTES / 1024 / 1024} MB まで読み込めます）`;
const NOT_A_FILE = '通常のファイルではありません（フォルダ・デバイス・パイプなどは読み込みません）';

/** 取り込むファイル（インポート）の大きさを確かめる。大きすぎるときは理由を書いた例外 */
export function assertReadableSize(bytes: number): void {
  if (bytes > MAX_SOURCE_FILE_BYTES) throw new Error(tooLarge(bytes));
}

/**
 * ファイルを UTF-8 で読む。無ければ undefined。
 * 通常のファイルでない・MAX_SOURCE_FILE_BYTES より大きいときは理由を書いた例外（画面の警告に出す）
 */
export function readTextIfExists(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  // 開く前に確かめる（名前付きパイプなどは開くだけで止まることがあるため）
  const before = statSync(path);
  if (!before.isFile()) throw new Error(NOT_A_FILE);
  if (before.size > MAX_SOURCE_FILE_BYTES) throw new Error(tooLarge(before.size));
  const fd = openSync(path, 'r');
  try {
    // 確かめてから開くまでに差し替えられた場合に備え、開いたものをもう一度確かめ、上限 + 1 バイトまでしか読まない
    const opened = fstatSync(fd);
    if (!opened.isFile()) throw new Error(NOT_A_FILE);
    const buffer = Buffer.alloc(MAX_SOURCE_FILE_BYTES + 1);
    let length = 0;
    for (;;) {
      const n = readSync(fd, buffer, length, buffer.length - length, null);
      if (n === 0) break;
      length += n;
      if (length > MAX_SOURCE_FILE_BYTES) throw new Error(tooLarge(length));
    }
    return buffer.subarray(0, length).toString('utf8');
  } finally {
    closeSync(fd);
  }
}

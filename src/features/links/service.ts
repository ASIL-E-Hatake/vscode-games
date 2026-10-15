// リンク集のホスト側処理: 4 つの出どころ（同梱・個人・共有ファイル・ワークスペース）の読み込みと、
// 個人リンクの追加・編集・削除・インポート・エクスポート
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join } from 'node:path';
import * as vscode from 'vscode';
import type { ContentStore } from '../../core/contentStore';
import type { ScopedStorage } from '../../core/storage';
import {
  applyImport,
  buildLinksData,
  describeInvalid,
  formatFromPath,
  parseLinkFile,
  planImport,
  serializeLinks,
  type LinkFileFormat,
  type LinkSourceGroup,
} from './logic';
import { strings } from './strings';
import type { Link, LinksData, PersonalLink } from './types';
import { validateLink } from './validate';

export const PERSONAL_KEY = 'personal';
export const SHARED_FILES_SETTING = 'hatake-gottani.links.sharedFiles';
export const WORKSPACE_FILE_NAMES = [
  'hatake-gottani.links.yaml',
  'hatake-gottani.links.yml',
  'hatake-gottani.links.json',
];

export interface ImportResult {
  added: number;
  overwritten: number;
  skipped: number;
  invalid: number;
}

/** 設定に書かれたパスを絶対パスにする（~ と ${userHome} を展開。相対パスはワークスペース基準） */
export function resolveSharedPath(raw: string, workspaceDir?: string): string {
  const expanded = raw
    .trim()
    .replace(/^~(?=$|[\\/])/, homedir())
    .replace(/\$\{userHome\}/g, homedir())
    .replace(/\$\{workspaceFolder\}/g, workspaceDir ?? '');
  return isAbsolute(expanded) || !workspaceDir ? expanded : join(workspaceDir, expanded);
}

export class LinkService implements vscode.Disposable {
  private readonly watchers: vscode.Disposable[] = [];
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly storage: ScopedStorage,
    private readonly content: ContentStore,
    private readonly onChange: () => void,
  ) {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(SHARED_FILES_SETTING)) {
          this.watchFiles();
          this.onChange();
        }
      }),
      vscode.workspace.onDidGrantWorkspaceTrust(() => this.onChange()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.watchFiles();
        this.onChange();
      }),
    );
    this.watchFiles();
  }

  // ---- 読み込み ----

  personal(): PersonalLink[] {
    return this.storage.get<PersonalLink[]>(PERSONAL_KEY) ?? [];
  }

  private async savePersonal(links: PersonalLink[]): Promise<void> {
    await this.storage.set(PERSONAL_KEY, links);
    this.onChange();
  }

  private workspaceDir(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  sharedFilePaths(): string[] {
    const raw = vscode.workspace.getConfiguration().get<string[]>(SHARED_FILES_SETTING, []);
    return raw
      .filter((p) => typeof p === 'string' && p.trim())
      .map((p) => resolveSharedPath(p, this.workspaceDir()));
  }

  workspaceFilePaths(): string[] {
    return (vscode.workspace.workspaceFolders ?? []).flatMap((folder) =>
      WORKSPACE_FILE_NAMES.map((name) => join(folder.uri.fsPath, '.vscode', name)),
    );
  }

  /** ファイルから読み込み、出どころのグループにする。問題は warnings に追記 */
  private readFile(
    path: string,
    source: 'shared' | 'workspace',
    warnings: string[],
  ): LinkSourceGroup | undefined {
    const label = basename(path);
    if (!existsSync(path)) {
      if (source === 'shared') warnings.push(strings.sharedNotFound(path));
      return undefined;
    }
    try {
      const parsed = parseLinkFile(readFileSync(path, 'utf8'), formatFromPath(path));
      warnings.push(...describeInvalid(label, parsed.invalid));
      return { source, name: parsed.name ?? label, links: parsed.links };
    } catch (e) {
      warnings.push(`${label}: ${(e as Error).message}`);
      return undefined;
    }
  }

  load(): LinksData {
    const warnings: string[] = [];
    const bundled = this.content.load<{ links: Link[] }>('links').flatMap((f) => f.data.links);
    const groups: LinkSourceGroup[] = [
      { source: 'bundled', links: bundled },
      { source: 'personal', links: this.personal() },
    ];
    for (const path of this.sharedFilePaths()) {
      const group = this.readFile(path, 'shared', warnings);
      if (group) groups.push(group);
    }
    const trusted = vscode.workspace.isTrusted;
    if (trusted) {
      for (const path of this.workspaceFilePaths()) {
        const group = this.readFile(path, 'workspace', warnings);
        if (group) groups.push(group);
      }
    }
    const untrustedWithFile = !trusted && this.workspaceFilePaths().some((p) => existsSync(p));
    return buildLinksData(groups, warnings, untrustedWithFile);
  }

  /** 共有ファイル・ワークスペースのファイルの変更を監視し、変わったら表示を更新する */
  private watchFiles(): void {
    for (const w of this.watchers.splice(0)) w.dispose();
    const targets = [...this.sharedFilePaths(), ...this.workspaceFilePaths()];
    for (const path of targets) {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(vscode.Uri.file(dirname(path)), basename(path)),
      );
      const changed = () => this.onChange();
      this.watchers.push(
        watcher,
        watcher.onDidChange(changed),
        watcher.onDidCreate(changed),
        watcher.onDidDelete(changed),
      );
    }
  }

  // ---- 個人リンクの編集 ----

  /** 入力を検証して追加する。エラーがあればエラーの配列を返す */
  async add(input: unknown): Promise<string[] | undefined> {
    const result = validateLink(input);
    if ('errors' in result) return result.errors;
    await this.savePersonal([...this.personal(), { ...result.link, id: randomUUID() }]);
    return undefined;
  }

  async update(id: string, input: unknown): Promise<string[] | undefined> {
    const result = validateLink(input);
    if ('errors' in result) return result.errors;
    const list = this.personal();
    const i = list.findIndex((l) => l.id === id);
    if (i < 0) return [strings.notFound];
    list[i] = { ...result.link, id };
    await this.savePersonal(list);
    return undefined;
  }

  /** 削除する。confirm が true なら確認ダイアログを出す。削除したら true */
  async delete(id: string, confirm = true): Promise<boolean> {
    const list = this.personal();
    const target = list.find((l) => l.id === id);
    if (!target) return false;
    if (confirm) {
      const answer = await vscode.window.showWarningMessage(
        strings.confirmDelete(target.title),
        { modal: true },
        strings.deleteButton,
      );
      if (answer !== strings.deleteButton) return false;
    }
    await this.savePersonal(list.filter((l) => l.id !== id));
    return true;
  }

  // ---- インポート・エクスポート ----

  /**
   * ファイルから個人リンクに取り込む。
   * uri を省略するとファイル選択、mode を省略すると件数を見せて確認する（テストでは両方指定する）
   */
  async importFrom(
    uri?: vscode.Uri,
    mode?: 'skip' | 'overwrite',
  ): Promise<ImportResult | undefined> {
    const target =
      uri ??
      (
        await vscode.window.showOpenDialog({
          canSelectMany: false,
          openLabel: strings.importButton,
          filters: { [strings.fileFilter]: ['yaml', 'yml', 'json'] },
        })
      )?.[0];
    if (!target) return undefined;

    let parsed;
    try {
      const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(target));
      parsed = parseLinkFile(text, formatFromPath(target.fsPath));
    } catch (e) {
      void vscode.window.showErrorMessage(`${strings.importFailed}: ${(e as Error).message}`);
      return undefined;
    }

    const existing = this.personal();
    const plan = planImport(existing, parsed.links);
    let chosen = mode;
    if (!chosen) {
      if (plan.added.length === 0 && plan.duplicates.length === 0) {
        void vscode.window.showInformationMessage(strings.nothingToImport(parsed.invalid.length));
        return { added: 0, overwritten: 0, skipped: 0, invalid: parsed.invalid.length };
      }
      const skip = strings.importSkip;
      const overwrite = strings.importOverwrite;
      const answer = await vscode.window.showInformationMessage(
        strings.importConfirm(basename(target.fsPath)),
        {
          modal: true,
          detail: strings.importDetail(
            plan.added.length,
            plan.duplicates.length,
            parsed.invalid.length,
          ),
        },
        ...(plan.duplicates.length > 0 ? [skip, overwrite] : [skip]),
      );
      if (!answer) return undefined;
      chosen = answer === overwrite ? 'overwrite' : 'skip';
    }

    await this.savePersonal(applyImport(existing, plan, chosen, randomUUID));
    const result: ImportResult = {
      added: plan.added.length,
      overwritten: chosen === 'overwrite' ? plan.duplicates.length : 0,
      skipped: chosen === 'skip' ? plan.duplicates.length : 0,
      invalid: parsed.invalid.length,
    };
    void vscode.window.showInformationMessage(strings.importDone(result));
    return result;
  }

  /** 個人リンクをファイルに書き出す。uri を省略すると保存先を選ぶ。書き出したファイルを返す */
  async exportTo(uri?: vscode.Uri): Promise<vscode.Uri | undefined> {
    const links = this.personal();
    if (links.length === 0) {
      void vscode.window.showInformationMessage(strings.nothingToExport);
      return undefined;
    }
    const target =
      uri ??
      (await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(
          join(this.workspaceDir() ?? homedir(), 'hatake-gottani-links.yaml'),
        ),
        saveLabel: strings.exportButton,
        filters: { YAML: ['yaml', 'yml'], JSON: ['json'] },
      }));
    if (!target) return undefined;
    const format: LinkFileFormat = formatFromPath(target.fsPath);
    await vscode.workspace.fs.writeFile(
      target,
      new TextEncoder().encode(serializeLinks(links, format, strings.exportName)),
    );
    void vscode.window.showInformationMessage(strings.exportDone(links.length, target.fsPath));
    return target;
  }

  dispose(): void {
    for (const d of [...this.watchers, ...this.disposables]) d.dispose();
  }
}

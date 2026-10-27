// リンク集のホスト側処理: 4 つの出どころ（同梱・個人・共有ファイル・ワークスペース）の読み込みと、
// 個人リンクの追加・編集・削除・インポート・エクスポート
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import * as vscode from 'vscode';
import type { ContentStore } from '../../core/contentStore';
import {
  assertReadableSize,
  FileSources,
  readTextIfExists,
  type FileSourceKind,
} from '../../core/fileSources';
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
import { notifyText } from '../../core/notifyText';

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

// 共有ファイルのパスの解決は問題パックと共通（src/core/fileSources.ts）
export { resolveSharedPath } from '../../core/fileSources';

export class LinkService implements vscode.Disposable {
  /** 共有ファイル・ワークスペースのファイルの場所と変更の監視（問題パックと共通） */
  private readonly files: FileSources;

  constructor(
    private readonly storage: ScopedStorage,
    private readonly content: ContentStore,
    private readonly onChange: () => void,
  ) {
    this.files = new FileSources({
      sharedFilesSetting: SHARED_FILES_SETTING,
      workspaceFileNames: WORKSPACE_FILE_NAMES,
      onChange,
    });
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
    return this.files.workspaceDir();
  }

  sharedFilePaths(): string[] {
    return this.files.sharedFilePaths();
  }

  workspaceFilePaths(): string[] {
    return this.files.workspaceFilePaths();
  }

  /** ファイルから読み込み、出どころのグループにする。問題は warnings に追記 */
  private readFile(
    path: string,
    source: FileSourceKind,
    warnings: string[],
  ): LinkSourceGroup | undefined {
    const label = basename(path);
    try {
      const text = readTextIfExists(path);
      if (text === undefined) {
        if (source === 'shared') warnings.push(strings.sharedNotFound(path));
        return undefined;
      }
      const parsed = parseLinkFile(text, formatFromPath(path));
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
    // 共有ファイル → ワークスペース（信頼済みのときだけ）の順
    for (const { path, source } of this.files.files()) {
      const group = this.readFile(path, source, warnings);
      if (group) groups.push(group);
    }
    return buildLinksData(groups, warnings, this.files.untrustedWithFile());
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
        notifyText(strings.confirmDelete(target.title)),
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
      assertReadableSize((await vscode.workspace.fs.stat(target)).size);
      const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(target));
      parsed = parseLinkFile(text, formatFromPath(target.fsPath));
    } catch (e) {
      void vscode.window.showErrorMessage(
        notifyText(`${strings.importFailed}: ${(e as Error).message}`),
      );
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
        notifyText(strings.importConfirm(basename(target.fsPath))),
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
    void vscode.window.showInformationMessage(
      notifyText(strings.exportDone(links.length, target.fsPath)),
    );
    return target;
  }

  dispose(): void {
    this.files.dispose();
  }
}

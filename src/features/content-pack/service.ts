// 問題パックのホスト側処理: 3 つの出どころ（個人・共有ファイル・ワークスペース）の読み込み、
// 有効 / 無効の切り替え、インポート・エクスポート。extension.ts で作り、AppServices.contentPacks として
// ゲーム（initData）と管理画面（content-pack）から使う。外部通信はしない（ファイルを読むだけ）
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import * as vscode from 'vscode';
import { packCounts, packToFile, type PackQuestionSet } from '../../core/contentPack';
import type { ContentPackView, PackImportResult } from '../../core/contentPackView';
import { formatFromPath, serializeData } from '../../core/dataFile';
import type { ContentPackService as ContentPackApi } from '../../core/feature';
import { assertReadableSize, FileSources, readTextIfExists } from '../../core/fileSources';
import type { ScopedStorage } from '../../core/storage';
import {
  applyImport,
  buildView,
  collectQuestions,
  describeInvalid,
  findSameName,
  normalizeDisabled,
  normalizePersonal,
  packKey,
  parsePackText,
  personalToLoaded,
  type LoadedPack,
  type PersonalPack,
} from './logic';
import { strings } from './strings';
import { notifyText } from '../../core/notifyText';

export const PERSONAL_KEY = 'personal';
export const DISABLED_KEY = 'disabled';
export const SHARED_FILES_SETTING = 'hatake-gottani.contentPacks.sharedFiles';
export const WORKSPACE_FILE_NAMES = [
  'hatake-gottani.pack.yaml',
  'hatake-gottani.pack.yml',
  'hatake-gottani.pack.json',
];

export interface ContentPackServiceOptions {
  storage: ScopedStorage;
  /** パックの内容・有効 / 無効が変わったとき（開いているパネルの表示を更新する） */
  onChange(): void;
  /** ワークスペースが信頼されているか（省略時は vscode.workspace.isTrusted。テストで差し替える） */
  isTrusted?(): boolean;
}

export class ContentPackService implements ContentPackApi, vscode.Disposable {
  private readonly files: FileSources;
  private readonly storage: ScopedStorage;
  private readonly onChange: () => void;

  constructor(options: ContentPackServiceOptions) {
    this.storage = options.storage;
    this.onChange = options.onChange;
    this.files = new FileSources({
      sharedFilesSetting: SHARED_FILES_SETTING,
      workspaceFileNames: WORKSPACE_FILE_NAMES,
      onChange: options.onChange,
      ...(options.isTrusted ? { isTrusted: options.isTrusted } : {}),
    });
  }

  // ---- 読み込み ----

  personal(): PersonalPack[] {
    return normalizePersonal(this.storage.get<unknown>(PERSONAL_KEY));
  }

  private disabled(): string[] {
    return normalizeDisabled(this.storage.get<unknown>(DISABLED_KEY));
  }

  /** すべての出どころのパックを読む（個人 → 共有ファイル → ワークスペース）。問題は warnings に追記 */
  private loadAll(warnings: string[]): LoadedPack[] {
    const loaded = personalToLoaded(this.personal());
    for (const { path, source } of this.files.files()) {
      const label = basename(path);
      try {
        const text = readTextIfExists(path);
        if (text === undefined) {
          warnings.push(strings.sharedNotFound(path));
          continue;
        }
        const parsed = parsePackText(text, formatFromPath(path), label);
        warnings.push(...describeInvalid(label, parsed.invalid));
        loaded.push({
          key: packKey(source, path),
          source,
          location: path,
          pack: parsed.pack,
          invalid: parsed.invalid.length,
        });
      } catch (e) {
        warnings.push(`${label}: ${(e as Error).message}`);
      }
    }
    return loaded;
  }

  questions(): PackQuestionSet {
    return collectQuestions(this.loadAll([]), this.disabled());
  }

  view(): ContentPackView {
    const warnings: string[] = [];
    const loaded = this.loadAll(warnings);
    return buildView(loaded, this.disabled(), warnings, this.files.untrustedWithFile());
  }

  // ---- 有効 / 無効・削除 ----

  async setEnabled(key: string, enabled: boolean): Promise<boolean> {
    if (!this.loadAll([]).some((p) => p.key === key)) return false;
    const rest = this.disabled().filter((k) => k !== key);
    await this.storage.set(DISABLED_KEY, enabled ? rest : [...rest, key]);
    this.onChange();
    return true;
  }

  async remove(key: string, confirm = true): Promise<boolean> {
    const list = this.personal();
    const target = list.find((p) => packKey('personal', p.id) === key);
    if (!target) return false;
    if (confirm) {
      const answer = await vscode.window.showWarningMessage(
        notifyText(strings.confirmRemove(target.pack.name)),
        { modal: true },
        strings.removeButton,
      );
      if (answer !== strings.removeButton) return false;
    }
    await this.storage.set(
      PERSONAL_KEY,
      list.filter((p) => p !== target),
    );
    await this.storage.set(
      DISABLED_KEY,
      this.disabled().filter((k) => k !== key),
    );
    this.onChange();
    return true;
  }

  // ---- インポート・エクスポート ----

  /**
   * ファイルから個人のパックに取り込む。
   * uri を省略するとファイル選択、mode を省略すると問題の数を見せて確認する（テストでは両方指定する）。
   * 同じ名前の個人のパックがあるとき、overwrite は置き換え、skip は取り込まない
   */
  async importFrom(
    uri?: vscode.Uri,
    mode?: 'overwrite' | 'skip',
  ): Promise<PackImportResult | undefined> {
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

    const fileName = basename(target.fsPath);
    let parsed;
    try {
      assertReadableSize((await vscode.workspace.fs.stat(target)).size);
      const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(target));
      parsed = parsePackText(text, formatFromPath(target.fsPath), fileName);
    } catch (e) {
      void vscode.window.showErrorMessage(
        notifyText(`${strings.importFailed}: ${(e as Error).message}`),
      );
      return undefined;
    }
    const counts = packCounts(parsed.pack);
    const invalid = parsed.invalid.length;
    if (Object.values(counts).every((n) => n === 0)) {
      void vscode.window.showWarningMessage(strings.nothingToImport(invalid));
      return undefined;
    }

    const list = this.personal();
    let chosen = mode;
    if (!chosen) {
      const sameName = findSameName(list, parsed.pack.name) >= 0;
      const answer = await vscode.window.showInformationMessage(
        notifyText(strings.importConfirm(fileName, parsed.pack.name)),
        { modal: true, detail: strings.importDetail(counts, invalid, sameName) },
        sameName ? strings.importOverwrite : strings.importAdd,
      );
      if (!answer) return undefined;
      chosen = 'overwrite';
    }

    const { list: next, status } = applyImport(
      list,
      { file: fileName, pack: parsed.pack, invalid },
      chosen,
      randomUUID,
    );
    if (status !== 'skipped') {
      await this.storage.set(PERSONAL_KEY, next);
      this.onChange();
    }
    const result: PackImportResult = { name: parsed.pack.name, status, counts, invalid };
    void vscode.window.showInformationMessage(
      notifyText(strings.importDone(parsed.pack.name, status, invalid)),
    );
    return result;
  }

  /**
   * パックをファイルに書き出す（どの出どころのパックでもよい。書き出したものは個人のパックとして取り込める）。
   * key を省略すると一覧から選び、uri を省略すると保存先を選ぶ。書き出したファイルを返す
   */
  async exportTo(uri?: vscode.Uri, key?: string): Promise<vscode.Uri | undefined> {
    const loaded = this.loadAll([]);
    if (loaded.length === 0) {
      void vscode.window.showInformationMessage(strings.nothingToExport);
      return undefined;
    }
    let pack = key
      ? loaded.find((p) => p.key === key)
      : loaded.length === 1
        ? loaded[0]
        : undefined;
    if (key && !pack) {
      void vscode.window.showErrorMessage(strings.notFound);
      return undefined;
    }
    if (!pack) {
      const picked = await vscode.window.showQuickPick(
        loaded.map((p) => ({ label: p.pack.name, description: p.location, item: p })),
        { placeHolder: strings.exportPick },
      );
      pack = picked?.item;
    }
    if (!pack) return undefined;
    const target =
      uri ??
      (await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(
          join(this.files.workspaceDir() ?? homedir(), 'hatake-gottani.pack.yaml'),
        ),
        saveLabel: strings.exportButton,
        filters: { YAML: ['yaml', 'yml'], JSON: ['json'] },
      }));
    if (!target) return undefined;
    await vscode.workspace.fs.writeFile(
      target,
      new TextEncoder().encode(serializeData(packToFile(pack.pack), formatFromPath(target.fsPath))),
    );
    void vscode.window.showInformationMessage(
      notifyText(strings.exportDone(pack.pack.name, target.fsPath)),
    );
    return target;
  }

  dispose(): void {
    this.files.dispose();
  }
}

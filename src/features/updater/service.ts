// アップデートの確認・インストール（拡張ホスト側のサービス）。
// 判定・URL・SHA256 などのロジックは logic.ts / client.ts、通信は transport.ts。
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { UpdateService } from '../../core/feature';
import { repositoryPage } from '../../core/repository';
import { readUpdateMode } from '../../core/settings';
import type { ScopedStorage } from '../../core/storage';
import type {
  UpdateAction,
  UpdateCommandOptions,
  UpdateCommandResult,
  UpdateStatus,
} from '../../core/updateStatus';
import { downloadVerifiedVsix, fetchLatestVersion } from './client';
import {
  buildUpdateStatus,
  describeError,
  isCheckRecord,
  isNewerStable,
  releaseUrls,
  shouldAutoCheck,
  startupDelayMs,
  vsixFileName,
  type CheckRecord,
  type HostPolicy,
  type ReleaseUrls,
} from './logic';
import { RELEASE_PUBLIC_KEY } from './releaseKey';
import { strings } from './strings';
import { createHttpGet, type HttpGet } from './transport';
import { notifyText } from '../../core/notifyText';

/** 自動確認の要否を見直す間隔（24 時間ごとの確認は shouldAutoCheck で判定する） */
const AUTO_CHECK_TICK_MS = 60 * 60 * 1000;
const RECORD_KEY = 'lastCheck';

interface Target {
  urls: ReleaseUrls;
  policy: HostPolicy;
  get: HttpGet;
  /** 署名を確かめる公開鍵（releaseKey.ts。テスト実行時だけ差し替えられる） */
  publicKey: string;
}

export interface UpdaterDeps {
  context: vscode.ExtensionContext;
  /** hatake-gottani.updater.* */
  storage: ScopedStorage;
  /** 状態が変わったとき（ホームの表示更新） */
  onChange(): void;
  /** 通信の差し替え（省略時は Node の https） */
  createGet?(policy: HostPolicy, userAgent: string): HttpGet;
}

export class UpdaterService implements UpdateService, vscode.Disposable {
  private readonly current: string;
  private readonly page: string | undefined;
  private busy: 'checking' | 'installing' | undefined;
  private target: string | undefined;
  private installed: string | undefined;
  private installError: string | undefined;
  /** このセッションで通知した版（同じ版を何度も通知しない） */
  private readonly notified = new Set<string>();
  private startupTimer: ReturnType<typeof setTimeout> | undefined;
  private tickTimer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly deps: UpdaterDeps) {
    const pkg = deps.context.extension.packageJSON as {
      version: string;
      repository?: { url?: string };
    };
    this.current = pkg.version;
    this.page = repositoryPage(pkg.repository?.url);
  }

  status(): UpdateStatus {
    return buildUpdateStatus({
      current: this.current,
      mode: readUpdateMode(),
      record: this.record(),
      busy: this.busy,
      target: this.target,
      installed: this.installed,
      installError: this.installError,
    });
  }

  /**
   * 自動確認を始める（起動から 30 秒〜5 分 30 秒後、その後は 1 時間ごとに 24 時間たったかを見る）。
   * 拡張機能のテスト実行時は実際の GitHub に通信しないよう、自動確認しない
   */
  start(): void {
    if (this.deps.context.extensionMode === vscode.ExtensionMode.Test) return;
    this.startupTimer = setTimeout(() => {
      void this.autoCheck();
      this.tickTimer = setInterval(() => void this.autoCheck(), AUTO_CHECK_TICK_MS);
    }, startupDelayMs(Math.random()));
  }

  dispose(): void {
    clearTimeout(this.startupTimer);
    clearInterval(this.tickTimer);
  }

  async run(action: UpdateAction): Promise<void> {
    if (action === 'reload') {
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
      return;
    }
    if (action === 'check') {
      await this.checkForUpdates();
      return;
    }
    const latest = this.record()?.latest;
    const target = this.targetFor();
    if (latest && target && isNewerStable(latest, this.current)) {
      await this.install(latest, target, true);
    }
  }

  async checkForUpdates(options: UpdateCommandOptions = {}): Promise<UpdateCommandResult> {
    const notify = options.notify !== false;
    const target = this.targetFor(options.repositoryPage, options.releasePublicKey);
    if (!target) return this.fail(strings.noRepository, notify);
    if (this.busy) return { status: this.status() };

    const check = this.check(target);
    if (notify) {
      vscode.window.setStatusBarMessage(
        readUpdateMode() === 'off' ? strings.checkingWhileOff : strings.checking,
        check,
      );
    }
    const { latest, error } = await check;
    if (!latest) return this.fail(error ?? '', notify, target);

    if (!isNewerStable(latest, this.current)) {
      if (notify) void vscode.window.showInformationMessage(strings.upToDate(this.current));
      return { status: this.status(), latest };
    }
    switch (options.install ?? 'ask') {
      case 'never':
        return { status: this.status(), latest };
      case 'verify-only':
        try {
          await downloadVerifiedVsix(
            target.get,
            target.urls,
            latest,
            target.policy,
            target.publicKey,
          );
          return { status: this.status(), latest, verified: true };
        } catch (err) {
          return { status: this.status(), latest, verified: false, error: describeError(err) };
        }
      case 'ask':
        if (notify) void this.offer(latest, target);
        return { status: this.status(), latest };
    }
  }

  // ---- 内部 ----

  private record(): CheckRecord | undefined {
    const value = this.deps.storage.get<unknown>(RECORD_KEY);
    return isCheckRecord(value) ? value : undefined;
  }

  /**
   * 確認先。repositoryPage の差し替え（ローカルのテスト用サーバー）と、署名の公開鍵の差し替え（テスト用の鍵）は、
   * 拡張機能のテスト実行時に repositoryPage を差し替えたときだけ有効
   */
  private targetFor(
    repositoryPageOverride?: string,
    publicKeyOverride?: string,
  ): Target | undefined {
    const isTest =
      this.deps.context.extensionMode === vscode.ExtensionMode.Test &&
      typeof repositoryPageOverride === 'string';
    const page = isTest ? repositoryPageOverride : this.page;
    if (!page) return undefined;
    const policy: HostPolicy = { allowLoopback: isTest };
    const createGet = this.deps.createGet ?? createHttpGet;
    return {
      urls: releaseUrls(page),
      policy,
      get: createGet(policy, `hatake-gottani/${this.current}`),
      publicKey:
        isTest && typeof publicKeyOverride === 'string' ? publicKeyOverride : RELEASE_PUBLIC_KEY,
    };
  }

  private changed(): void {
    this.deps.onChange();
  }

  private async autoCheck(): Promise<void> {
    const mode = readUpdateMode();
    if (mode === 'off' || this.busy || this.installed) return;
    if (!shouldAutoCheck(this.record(), new Date())) return;
    const target = this.targetFor();
    if (!target) return;
    // 自動確認の失敗（オフライン・プロキシなど）は通知しない（ホームの表示だけ）
    const { latest } = await this.check(target);
    if (!latest || !isNewerStable(latest, this.current)) return;
    if (mode === 'auto') {
      await this.install(latest, target, false);
    } else if (!this.notified.has(latest)) {
      this.notified.add(latest);
      void this.offer(latest, target);
    }
  }

  private async check(target: Target): Promise<{ latest?: string; error?: string }> {
    this.busy = 'checking';
    this.installError = undefined;
    this.changed();
    const previous = this.record();
    try {
      const latest = await fetchLatestVersion(target.get, target.urls, target.policy);
      await this.deps.storage.set<CheckRecord>(RECORD_KEY, {
        checkedAt: new Date().toISOString(),
        latest,
      });
      return { latest };
    } catch (err) {
      const error = describeError(err);
      await this.deps.storage.set<CheckRecord>(RECORD_KEY, {
        ...previous,
        failedAt: new Date().toISOString(),
        error,
      });
      return { error };
    } finally {
      this.busy = undefined;
      this.changed();
    }
  }

  /** 新しい版があることを知らせ、ボタンで更新・リリースノートを開く */
  private async offer(latest: string, target: Target): Promise<void> {
    const choice = await vscode.window.showInformationMessage(
      strings.available(latest, this.current),
      strings.installButton,
      strings.notesButton,
    );
    if (choice === strings.installButton) await this.install(latest, target, true);
    else if (choice === strings.notesButton) await this.openUrl(target.urls.notes(latest));
  }

  /** ダウンロード → 署名と SHA256 の検証 → 一時ファイルからインストール → 一時ファイルを削除 */
  private async install(version: string, target: Target, manual: boolean): Promise<void> {
    if (this.busy || this.installed === version) return;
    this.busy = 'installing';
    this.target = version;
    this.installError = undefined;
    this.changed();
    let dir: string | undefined;
    try {
      const download = downloadVerifiedVsix(
        target.get,
        target.urls,
        version,
        target.policy,
        target.publicKey,
      );
      vscode.window.setStatusBarMessage(strings.installing(version), download);
      const vsix = await download;
      dir = await mkdtemp(join(tmpdir(), 'hatake-gottani-update-'));
      const file = join(dir, vsixFileName(version));
      await writeFile(file, vsix);
      try {
        await vscode.commands.executeCommand(
          'workbench.extensions.installExtension',
          vscode.Uri.file(file),
        );
      } catch (err) {
        throw new Error(`${strings.installCommandFailed}: ${describeError(err)}`, { cause: err });
      }
      this.installed = version;
      void vscode.window
        .showInformationMessage(strings.installed(version), strings.reloadButton)
        .then((choice) => {
          if (choice === strings.reloadButton) {
            void vscode.commands.executeCommand('workbench.action.reloadWindow');
          }
        });
    } catch (err) {
      this.installError = describeError(err);
      if (manual) {
        void vscode.window
          .showWarningMessage(
            notifyText(strings.installFailed(this.installError)),
            strings.openReleasesButton,
          )
          .then((choice) => {
            if (choice) void this.openUrl(target.urls.releases);
          });
      }
    } finally {
      this.busy = undefined;
      if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      this.changed();
    }
  }

  private fail(reason: string, notify: boolean, target?: Target): UpdateCommandResult {
    if (notify) {
      const releases = target?.urls.releases;
      void vscode.window
        .showWarningMessage(
          notifyText(strings.checkFailed(reason)),
          ...(releases ? [strings.openReleasesButton] : []),
        )
        .then((choice) => {
          if (choice && releases) void this.openUrl(releases);
        });
    }
    return { status: this.status(), error: reason };
  }

  private async openUrl(url: string): Promise<void> {
    await vscode.env.openExternal(vscode.Uri.parse(url, true));
  }
}

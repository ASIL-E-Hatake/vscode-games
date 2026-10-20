// 画像の保存・真ん中の画像の読み込み（ホスト側）。VS Code API は deps で受け取る（L1 対象）。
// 各機能の feature.ts がコマンドと Webview からの custom メッセージをここにつなぐ。
import {
  logoFromBytes,
  parseSaveRequest,
  saveRequestBytes,
  type ImageAction,
  type ImageFormat,
  type ImageReply,
  type LogoResult,
} from './imageExport';

export interface ImageFileDeps<U> {
  /** 保存先を選ぶ（キャンセルなら undefined） */
  pickSave(defaultName: string, format: ImageFormat): Promise<U | undefined>;
  /** 開く画像を選ぶ（キャンセルなら undefined） */
  pickOpen(): Promise<U | undefined>;
  write(uri: U, bytes: Uint8Array): Promise<void>;
  read(uri: U): Promise<Uint8Array>;
  /** 表示用のパス・ファイル名 */
  pathOf(uri: U): string;
  nameOf(uri: U): string;
}

export type SaveResult<U> =
  { ok: true; uri: U } | { ok: false; reason: 'invalid' | 'cancelled' | 'failed'; error?: string };

/** 画像を保存する。uri を渡すとダイアログを出さずにそこへ書く（テスト・コマンドの引数用） */
export async function saveImage<U>(
  request: unknown,
  uri: U | undefined,
  deps: ImageFileDeps<U>,
): Promise<SaveResult<U>> {
  const parsed = parseSaveRequest(request);
  if (!parsed) return { ok: false, reason: 'invalid' };
  const target = uri ?? (await deps.pickSave(`${parsed.name}.${parsed.format}`, parsed.format));
  if (target === undefined) return { ok: false, reason: 'cancelled' };
  try {
    await deps.write(target, saveRequestBytes(parsed));
    return { ok: true, uri: target };
  } catch (err) {
    return { ok: false, reason: 'failed', error: String(err) };
  }
}

export type LoadLogoResult = LogoResult | { ok: false; reason: 'cancelled' | 'failed' };

/** 真ん中に入れる画像を読む。uri を渡すとダイアログを出さない */
export async function loadLogo<U>(
  uri: U | undefined,
  deps: ImageFileDeps<U>,
): Promise<LoadLogoResult> {
  const target = uri ?? (await deps.pickOpen());
  if (target === undefined) return { ok: false, reason: 'cancelled' };
  let bytes: Uint8Array;
  try {
    bytes = await deps.read(target);
  } catch {
    return { ok: false, reason: 'failed' };
  }
  return logoFromBytes(bytes, deps.nameOf(target));
}

export interface ImageMessages {
  saved(path: string): string;
  saveFailed: string;
  invalid: string;
  /** 真ん中の画像を使う機能（QR コード）のみ */
  logoTooLarge?: string;
  logoUnsupported?: string;
  logoFailed?: string;
}

/** Webview からの custom メッセージ（ImageAction）を処理し、返信（ImageReply）を返す */
export async function handleImageAction<U>(
  payload: unknown,
  deps: ImageFileDeps<U>,
  messages: ImageMessages,
  options: { logo: boolean },
): Promise<ImageReply | undefined> {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const action = payload as ImageAction;
  if (action.action === 'save') {
    const result = await saveImage(action.request, undefined, deps);
    if (result.ok) return { action: 'saved', path: messages.saved(deps.pathOf(result.uri)) };
    if (result.reason === 'cancelled') return undefined;
    return {
      action: 'saveFailed',
      message: result.reason === 'invalid' ? messages.invalid : messages.saveFailed,
    };
  }
  if (action.action === 'pickLogo' && options.logo) {
    const result = await loadLogo(undefined, deps);
    if (result.ok) return { action: 'logo', dataUrl: result.dataUrl, name: result.name };
    if (result.reason === 'cancelled') return undefined;
    const message =
      result.reason === 'tooLarge'
        ? messages.logoTooLarge
        : result.reason === 'unsupported'
          ? messages.logoUnsupported
          : messages.logoFailed;
    return { action: 'logoFailed', message: message ?? messages.invalid };
  }
  return undefined;
}

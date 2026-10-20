// QR コードの画面の状態（保存する設定と、パネルを隠して戻したときの一時状態）
import { isLogoDataUrl, PNG_SIZES } from '../../../core/imageExport';
import { restoreColors, type Colors } from '../../../webview-shared/colorFields';
import {
  clampLogoPercent,
  clampMargin,
  DARK_GLYPHS,
  ECC_LEVELS,
  LIGHT_GLYPHS,
  LOGO_DEFAULT_PERCENT,
  MARGIN_DEFAULT,
  type EccLevel,
} from '../logic';
import { QR_KINDS, savableFields, type Fields, type QrKind } from '../payload';

export type Render = 'image' | 'text';
/** 黒いマスに任意の 1 文字を使う */
export const CUSTOM = 'custom';
export const SETTINGS_KEY = 'settings';

/** 保存する設定（Wi-Fi のパスワード・真ん中の画像は含めない） */
export interface Settings {
  kind: QrKind;
  fields: Partial<Record<QrKind, Fields>>;
  ecc: EccLevel;
  render: Render;
  dark: string;
  custom: string;
  light: string;
  margin: number;
  colors: Colors;
  size: number;
  logoPercent: number;
}

/** パネルを隠して戻したときに戻す一時状態（パスワード・画像も含む。閉じると消える） */
export interface ViewState extends Settings {
  logo?: { dataUrl: string; name: string };
}

export const defaults = (): ViewState => ({
  kind: 'url',
  fields: {},
  ecc: 'M',
  render: 'image',
  dark: DARK_GLYPHS[0],
  custom: '',
  light: LIGHT_GLYPHS[0],
  margin: MARGIN_DEFAULT,
  colors: restoreColors(undefined),
  size: 512,
  logoPercent: LOGO_DEFAULT_PERCENT,
});

/** 保存していた値を確かめて使う */
export function restore(value: unknown): ViewState {
  const d = defaults();
  if (typeof value !== 'object' || value === null) return d;
  const v = value as Partial<ViewState>;
  const fields: Partial<Record<QrKind, Fields>> = {};
  for (const kind of QR_KINDS) {
    const f = v.fields?.[kind];
    if (typeof f === 'object' && f !== null) {
      fields[kind] = Object.fromEntries(
        Object.entries(f).filter((e): e is [string, string] => typeof e[1] === 'string'),
      );
    }
  }
  return {
    kind: QR_KINDS.includes(v.kind as QrKind) ? (v.kind as QrKind) : d.kind,
    fields,
    ecc: ECC_LEVELS.includes(v.ecc as EccLevel) ? (v.ecc as EccLevel) : d.ecc,
    render: v.render === 'text' ? 'text' : 'image',
    dark: [...DARK_GLYPHS, CUSTOM].includes(v.dark ?? '') ? v.dark! : d.dark,
    custom: typeof v.custom === 'string' ? v.custom.slice(0, 2) : '',
    light: (LIGHT_GLYPHS as readonly string[]).includes(v.light ?? '') ? v.light! : d.light,
    margin: clampMargin(Number(v.margin ?? d.margin)),
    colors: restoreColors(v.colors),
    size: (PNG_SIZES as readonly number[]).includes(Number(v.size)) ? Number(v.size) : d.size,
    logoPercent: clampLogoPercent(Number(v.logoPercent ?? d.logoPercent)),
    ...(v.logo && isLogoDataUrl(v.logo.dataUrl) ? { logo: v.logo } : {}),
  };
}

/** 保存する形にする（秘密の入力と真ん中の画像を除く） */
export function toSettings(state: ViewState): Settings {
  const rest: ViewState = { ...state };
  delete rest.logo;
  return {
    ...rest,
    fields: Object.fromEntries(
      QR_KINDS.map((kind) => [kind, savableFields(kind, state.fields[kind] ?? {})]),
    ),
  };
}

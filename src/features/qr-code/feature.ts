import type { FeatureDefinition } from '../../core/feature';
import {
  imageFeatureHandle,
  registerImageCommands,
  type ImageFeatureOptions,
} from '../../core/imageFeature';
import { hostStrings, strings } from './strings';

/** 保存（引数: 保存先の URI, ImageSaveRequest）と真ん中の画像（引数: 画像の URI）のコマンド */
export const QR_SAVE_COMMAND = 'hatake-gottani.qrCode.save';
export const QR_LOGO_COMMAND = 'hatake-gottani.qrCode.pickLogo';

const imageOptions: ImageFeatureOptions = {
  saveCommand: QR_SAVE_COMMAND,
  logoCommand: QR_LOGO_COMMAND,
  labels: {
    save: hostStrings.saveLabel,
    open: hostStrings.openLabel,
    filter: hostStrings.imageFilter,
  },
  messages: hostStrings.messages,
};

export const feature: FeatureDefinition = {
  id: 'qr-code',
  title: strings.title,
  description: strings.description,
  category: 'tool',
  icon: 'device-mobile',
  kind: 'webview',
  tags: ['QR', 'QR コード', 'URL', 'Wi-Fi', 'vCard', '連絡先', '名刺', '画像', 'PNG', 'SVG'],

  register: () => registerImageCommands(imageOptions),

  activate: () => imageFeatureHandle(imageOptions),
};

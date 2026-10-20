import type { FeatureDefinition } from '../../core/feature';
import {
  imageFeatureHandle,
  registerImageCommands,
  type ImageFeatureOptions,
} from '../../core/imageFeature';
import { hostStrings, strings } from './strings';

/** 保存のコマンド（引数: 保存先の URI, ImageSaveRequest） */
export const BARCODE_SAVE_COMMAND = 'hatake-gottani.barcode.save';

const imageOptions: ImageFeatureOptions = {
  saveCommand: BARCODE_SAVE_COMMAND,
  labels: {
    save: hostStrings.saveLabel,
    open: hostStrings.openLabel,
    filter: hostStrings.imageFilter,
  },
  messages: hostStrings.messages,
};

export const feature: FeatureDefinition = {
  id: 'barcode',
  title: strings.title,
  description: strings.description,
  category: 'tool',
  icon: 'tag',
  kind: 'webview',
  tags: ['バーコード', 'JAN', 'EAN', 'Code128', 'Code39', '商品コード', '画像', 'PNG', 'SVG'],

  register: () => registerImageCommands(imageOptions),

  activate: () => imageFeatureHandle(imageOptions),
};

// 画面の状態（bridge.setState に保存する）。貼り付けた設定は保存しない（パスワードなどを残さない）
import type { FileOutputState } from '../../../webview-shared/fileOutput';
import { defaultDatasourceInput, type DatasourceInput } from '../datasource';
import type { InputFormat } from '../detect';
import type { EnvFormat } from '../env';
import { strings } from '../strings';

export type Tab = 'convert' | 'datasource' | 'profiles';

export interface ViewState {
  tab: Tab;
  convert: { format: InputFormat | 'auto'; envFormat: EnvFormat; file: FileOutputState };
  datasource: DatasourceInput & { file: FileOutputState };
  profiles: { names: string; active: string; file: FileOutputState };
}

export const initialState = (): ViewState => ({
  tab: 'convert',
  convert: { format: 'auto', envFormat: 'compose', file: {} },
  datasource: { ...defaultDatasourceInput(), file: {} },
  profiles: { names: strings.profiles.namesDefault, active: '', file: {} },
});

/** 保存していた状態を読む（形が古い・壊れているときは既定値で埋める） */
export function restoreState(saved: Partial<ViewState> | undefined): ViewState {
  const base = initialState();
  if (!saved || typeof saved !== 'object') return base;
  return {
    tab: saved.tab ?? base.tab,
    convert: { ...base.convert, ...saved.convert },
    datasource: { ...base.datasource, ...saved.datasource },
    profiles: { ...base.profiles, ...saved.profiles },
  };
}

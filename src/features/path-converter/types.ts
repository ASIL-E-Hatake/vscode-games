/** ホストから Webview に渡すデータ */
export interface PathConverterData {
  /** 開いているファイルのパス（file スキームのときだけ。開いていなければ無し） */
  activeFilePath?: string;
}

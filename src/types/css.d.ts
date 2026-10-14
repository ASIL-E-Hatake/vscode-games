// esbuild が CSS を別ファイル（dist/webview/<id>.css）に出力するため、副作用 import として扱う
declare module '*.css';

// 設定ファイルの組み立て（generators）の入力の誤り（表示文字列）。各行の説明は nginxStrings.ts・systemdStrings.ts・tomcatStrings.ts
export const err = {
  appName: (v: string) =>
    `アプリ名「${v}」は使えません。英小文字で始まり、英小文字・数字・-（ハイフン）だけの 32 文字以内にしてください（ユニット名・フォルダ名・ファイル名に使うため）`,
  user: (label: string, v: string) =>
    `${label}「${v}」は使えません。英小文字か _ で始まり、英小文字・数字・_・- だけの 32 文字以内にしてください`,
  rootUser: (label: string) =>
    `${label}に root は使えません。アプリ専用のユーザー（ログインしないシステムユーザー）にしてください`,
  port: (v: number) =>
    `ポート「${v}」は使えません。1024〜65535 の整数にしてください（アプリは root 以外のユーザーで動かすため、1023 以下は使えません。80 / 443 は Nginx が受けます）`,
  domain: (v: string) =>
    `ドメイン「${v}」は使えません。app.example.com のような形（英数字・-・. だけ。ラベルは 63 文字以内、先頭と末尾に - は置けない）にしてください`,
  path: (label: string, v: string) =>
    `${label}「${v}」は使えません。/ で始まる絶対パスで、英数字・. ・_ ・- ・/ だけにしてください（空白・引用符・; などは設定ファイルの書き方を壊すため使えません。.. と末尾の / も使えません）`,
  jarName: (v: string) =>
    `jar のファイル名「${v}」は使えません。英数字・. ・_ ・- だけで、.jar で終わる名前にしてください`,
  javaOpts: (v: string) =>
    `JVM のオプション「${v}」は使えません。-Xmx512m のように - で始まるオプションを空白で区切って並べてください（引用符・$・; ・改行などは使えません）`,
  profile: (v: string) =>
    `プロファイル「${v}」は使えません。英数字・_・- だけ（複数ならカンマ区切り。空なら指定しない）にしてください`,
  maxBodySize: (v: string) =>
    `アップロードの上限「${v}」は使えません。10m・512k・1g のように数字と単位（k・m・g。省略するとバイト）にしてください`,
  tomcatVersion: (v: string) =>
    `Tomcat の版「${v}」は使えません。10.1.48・11.0.13 のように 10.1 か 11.0 の版を書いてください（Spring Boot 3 以降は 10.1 以上が必要です）`,
  catalinaBaseInsideRoot: (base: string, home: string) =>
    `CATALINA_BASE（${base}）を本体のフォルダ（${home}）の中にはできません。本体と設定を分けるため、別のフォルダにしてください`,
};

export const label = {
  appUser: 'アプリのユーザー',
  tomcatUser: 'Tomcat のユーザー',
  installDir: 'インストール先',
  certPath: '証明書のパス',
  keyPath: '秘密鍵のパス',
  tomcatRoot: 'Tomcat の本体を置くフォルダ',
  catalinaBase: 'CATALINA_BASE',
};

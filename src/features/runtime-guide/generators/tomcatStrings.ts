// 外部 Tomcat の setenv.sh と server.xml の変更部分の各行の説明と注意（表示文字列。組み立ては tomcat.ts）
export const tc = {
  // ---- setenv.sh ----
  header:
    'catalina.sh が起動のたびに読み込む（CATALINA_BASE/bin にあればそちらが優先）。本体（CATALINA_HOME）を上げても残るよう、CATALINA_BASE に置く',
  javaHome: (home: string) =>
    `Tomcat が使う Java（${home}）。alternatives の切り替えには左右されないので、Java を上げたらここを書き換える`,
  catalinaOpts:
    'JVM のオプション。JAVA_OPTS ではなく CATALINA_OPTS に書く（JAVA_OPTS は停止のコマンドなどにも使われ、-Xmx の分のメモリをそこでも取ってしまう）。前の値を残して後ろに足す',
  exitOnOom:
    'メモリ不足になったら Tomcat を止める（中途半端に動き続けず、systemd の Restart=on-failure で起動し直す）',
  fileEncoding:
    'Java 17 は文字コードの既定が OS のロケールで決まる（サーバーが C ロケールだと日本語が化ける）ため UTF-8 にする。Java 18 以降は既定が UTF-8 なので要らない',
  umask:
    '作るファイル（ログなど）の権限を 640 にする。Tomcat の既定も 0027 だが、変えたときに気づけるよう明示する',
  notWritten:
    '書かないもの: -Djava.security.egd=file:/dev/./urandom（Java 9 以降は不要）、-Dfile.encoding（Java 18 以降は既定が UTF-8）、-server（64 ビットの JVM では意味が無い）',

  // ---- server.xml ----
  shutdownPort:
    'シャットダウンポート（既定 8005。SHUTDOWN という文字列を送ると Tomcat が止まる）を閉じる（-1）。止めるのは systemd（SIGTERM）で行う',
  connector: (port: number) =>
    `HTTP のコネクタを 127.0.0.1 の ${port} 番だけで待ち受ける（外から直接繋がらず、必ず Nginx を通る）。TLS は Nginx で終えるので redirectPort と 8443 のコネクタは使わない。maxParameterCount はパラメーターの数の上限（大量のパラメーターでの DoS を防ぐ）`,
  ajp: 'AJP のコネクタ（8009）はコメントのまま有効にしない（Nginx とは HTTP で繋ぐ。AJP は過去に重大な脆弱性があった）',
  remoteIp:
    'Nginx が付けた X-Forwarded-For・X-Forwarded-Proto を読み、利用者の IP・https を アプリに見せる（request.getRemoteAddr()・isSecure()）。信頼する転送元（internalProxies）は同じサーバーの Nginx（127.0.0.1・::1）だけにし、ほかから来たヘッダーは無視する（偽装を防ぐ）',
  accessLog:
    'アクセスログ。requestAttributesEnabled="true" で RemoteIpValve が読んだ利用者の IP を記録する（無いとすべて 127.0.0.1 になる）。%a は IP、%D は処理にかかった時間（ミリ秒）',
  errorReport:
    'エラーページ（404・500 など）に Tomcat の版と例外の詳細を出さない。Server ヘッダーは 10.1 以降は既定で送らないので、Connector の server 属性は書かない（書くとその文字列が送られる）',
  placeShutdown:
    '① <Server> の開始タグ（元: <Server port="8005" shutdown="SHUTDOWN">）を置き換える',
  placeConnector:
    '② <Service name="Catalina"> の中の <Connector port="8080" protocol="HTTP/1.1" … /> を置き換える',
  placeRemoteIp: '③ <Engine name="Catalina" defaultHost="localhost"> の直後に足す',
  placeHost:
    '④ <Host name="localhost" …> の中の AccessLogValve を置き換え、その下に ErrorReportValve を足す',

  // ---- 注意 ----
  warnPartial: (path: string) =>
    `server.xml 全体ではなく、変える部分だけです。${path} の①〜④の場所を、それぞれ置き換え・追記してください（元のファイルはコピーを取っておく）`,
  warnVersion: (major: string) =>
    `Tomcat ${major} 用。ここで変える部分は 10.1 と 11 で同じ（11 は Java 17 以上が必要）`,
  warnApps: (base: string) =>
    `既定のアプリ（ROOT・docs・examples・host-manager・manager）は消す: sudo rm -rf ${base}/webapps/{ROOT,docs,examples,host-manager,manager}。manager を使うときも外部に公開しない`,
  warnCheck:
    '書き換えたら sudo systemctl restart tomcat → journalctl -u tomcat で「Server startup in」を確かめる。XML の誤りがあると起動しない',
  warnSpringBoot:
    'war の Spring Boot には server.forward-headers-strategy を設定しない（RemoteIpValve が同じことをする。二重にしない）',
  warnSetenvOwner: (path: string, user: string) =>
    `setenv.sh は root の持ち物にし、Tomcat から書き換えられないようにする（catalina.sh が読み込むだけなので実行権限は要らない）: sudo chown root:${user} ${path} && sudo chmod 640 ${path}`,
  warnJavaUpgrade:
    'Java を上げたら JAVA_HOME も書き換えて sudo systemctl restart tomcat（alternatives の切り替えでは変わらない）',
};

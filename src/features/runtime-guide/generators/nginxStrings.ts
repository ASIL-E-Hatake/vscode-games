// Nginx の conf の各行の説明と注意（表示文字列。組み立ては nginx.ts）
export const nx = {
  redirectServer:
    'HTTP（80 番）で来たアクセスを受ける server ブロック。中身は HTTPS への転送だけ（アプリには渡さない）',
  listen80: '80 番（HTTP）で待ち受ける（IPv4）',
  listen80v6: '80 番（HTTP）で待ち受ける（IPv6）。IPv6 を使わないサーバーでは消してよい',
  serverName: (domain: string) =>
    `このブロックが受けるドメイン（${domain}）。ほかの名前で来たアクセスは、このファイルでは受けない`,
  redirect: (domain: string) =>
    `https://${domain}/… へ恒久的に転送する（301）。転送先のドメインは $host（利用者が送ってきた Host ヘッダー）ではなく固定で書き、別のドメインへ飛ばされないようにする`,
  blockEnd: 'server ブロックの終わり',
  mainServerTls: 'HTTPS（443 番）で受けて、アプリへ転送する server ブロック',
  mainServerHttp:
    'HTTP（80 番）で受けて、アプリへ転送する server ブロック（TLS なし。社内の検証用などに限る）',
  listen443: '443 番（HTTPS）で待ち受ける（IPv4）。ssl で TLS を使う',
  listen443v6: '443 番（HTTPS）で待ち受ける（IPv6）。IPv6 を使わないサーバーでは消してよい',
  cert: '証明書のファイル。中間証明書を含む「チェーン」のファイルを指定する（サーバー証明書だけだと、一部の端末で警告が出る）',
  key: '秘密鍵のファイル。root だけが読めるようにする（chmod 600）。Nginx は root で起動してから読むので、nginx ユーザーに読ませる必要は無い',
  protocols:
    '使う TLS の版を 1.2 と 1.3 に限る（1.0・1.1 は弱いため使わない）。暗号の種類は OS の既定（RHEL 系は crypto-policies）に任せる',
  sessionCache:
    'TLS の接続情報を Nginx の全ワーカーで共有し、再接続を速くする（10 MB で約 4 万接続分）',
  sessionTimeout: '共有した接続情報を使える時間（1 日）',
  sessionTickets:
    'セッションチケットを使わない（鍵を入れ替えないまま使い続けると、前方秘匿性が弱まるため）',
  serverTokens: 'エラーページと Server ヘッダーに Nginx の版を出さない（攻撃する側に版を教えない）',
  maxBody: (size: string) =>
    `受け取るリクエストの本文の上限（${size}）。超えると 413 を返す。アップロードの上限に合わせる（アプリ側の上限 spring.servlet.multipart.max-file-size なども合わせる）`,
  nosniff:
    'ブラウザに Content-Type を推測させない（画像のふりをしたスクリプトの実行などを防ぐ）。always でエラーの応答にも付ける',
  referrer:
    'ほかのサイトへ移動するときに送る Referer を、ドメインだけにする（URL のパスや問い合わせの文字列を外へ渡さない）',
  hsts: 'このドメインには今後 1 年間 HTTPS だけで繋ぐよう、ブラウザに覚えさせる（HSTS）。includeSubDomains は全サブドメインが HTTPS になってから足す',
  headersNote:
    'add_header は、location の中に 1 つでも add_header を書くと、server に書いたものが引き継がれなくなる（location にも同じものを書く）',
  location: 'すべてのパスをアプリへ転送する',
  proxyPass: (port: number) =>
    `転送先。同じサーバーで動くアプリ（127.0.0.1 の ${port} 番）へ渡す。アプリは 127.0.0.1 だけで待ち受け、外から直接繋がらないようにする`,
  httpVersion: 'アプリとの間を HTTP/1.1 にする（keep-alive・チャンク転送が使える）',
  host: '利用者が送ってきた Host（ドメイン）をアプリへ渡す。無いとアプリはリダイレクト先などを 127.0.0.1 で作ってしまう',
  realIp: '利用者の IP アドレスを渡す（ログ用）',
  forwardedFor:
    '利用者の IP アドレスを X-Forwarded-For で渡す。この Nginx が入口なので、利用者が送ってきた X-Forwarded-For は引き継がずに上書きする（IP の偽装を防ぐ。前にロードバランサーがあるときは $proxy_add_x_forwarded_for にし、アプリ側で信頼する転送元を限る）',
  forwardedProto:
    '利用者との通信が http か https かを渡す。アプリ（Spring の forward-headers-strategy・Tomcat の RemoteIpValve）がこれを見て https の URL を作る',
  connectTimeout: 'アプリへの接続を待つ時間。アプリが止まっているときに早く 502 を返す',
  readTimeout:
    'アプリからの応答を待つ時間（60 秒。既定と同じ値を明示）。時間のかかる処理（帳票の出力など）があるときだけ、その location を分けて延ばす',
  sendTimeout: 'アプリへリクエストを送り終えるまでの時間（60 秒）',
  locationEnd: 'location ブロックの終わり',

  // ---- 注意 ----
  warnSelinux:
    'RHEL 系は SELinux が有効なため、このままだと Nginx からアプリへ転送できない（502。/var/log/audit/audit.log に denied）。sudo setsebool -P httpd_can_network_connect 1 で許可する',
  warnSelinuxAl:
    'Amazon Linux 2023 の SELinux は既定で permissive（記録だけ）。enforcing にしているときは sudo setsebool -P httpd_can_network_connect 1 が要る',
  warnFirewalld: (tls: boolean) =>
    `firewalld で ${tls ? '80 / 443' : '80'} 番を開ける: sudo firewall-cmd --permanent ${tls ? '--add-service=http --add-service=https' : '--add-service=http'} && sudo firewall-cmd --reload`,
  warnFirewallAl: (tls: boolean) =>
    `Amazon Linux 2023 は firewalld が入っていないことが多い。EC2 のセキュリティグループで ${tls ? '80 / 443' : '80'} 番を開ける`,
  warnSpring:
    'Spring Boot（組み込み Tomcat）は server.forward-headers-strategy=framework（環境変数なら SERVER_FORWARD_HEADERS_STRATEGY=framework）を設定する。外部 Tomcat は server.xml に RemoteIpValve を入れる。無いと https のページから http へリダイレクトされる',
  warnCsp:
    'Content-Security-Policy は付けていない（読み込むスクリプト・画像の場所はアプリ次第で、合わない値を付けると画面が壊れる）。アプリに合わせて Report-Only で試してから付ける',
  warnTest:
    '書き換えたら sudo nginx -t で文法を確かめてから sudo systemctl reload nginx（reload は接続を切らずに設定を読み直す。restart は一度止める）',
  warnNoTls:
    'TLS なしの設定です。パスワードや Cookie が平文で流れるため、社外に公開するサーバーでは使わない',
  warnTlsOnly:
    'HTTP（80 番）は受けない設定です。http:// で来た利用者には繋がらないので、HTTPS への転送を付けるか、案内の URL を https にする',
};

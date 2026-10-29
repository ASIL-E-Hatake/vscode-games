// systemd のユニット（Spring Boot・外部 Tomcat）と環境変数ファイルの各行の説明と注意（表示文字列。組み立ては systemd.ts）
export const sd = {
  unit: '[Unit] 節: ユニットの説明と、起動の順番',
  descriptionSpring: (app: string) => `systemctl status などに出る名前（${app}）`,
  descriptionTomcat: 'systemctl status などに出る名前',
  after:
    'ネットワークが使えるようになってから起動する（DB など別のサーバーへ繋ぐアプリのため）。Wants= とセットで書く',
  wants: 'network-online.target（ネットワークが使えるまで待つ仕組み）を一緒に起動する',
  service: '[Service] 節: 動かし方',
  typeExec:
    'Type=exec: 起動したプロセス（java）そのものをサービスとして見張る。java が見つからないなど起動に失敗したら、すぐ失敗として扱われる（simple より気づきやすい）',
  user: (u: string) =>
    `アプリを動かす専用ユーザー（${u}）。root で動かさない（アプリに穴があっても、サーバー全体を取られない）`,
  group: (g: string) =>
    `同じ名前のグループ（${g}）。設定ファイルをこのグループだけに読ませるのに使う`,
  workingDir: (dir: string) =>
    `作業フォルダ（${dir}）。Spring Boot は ./config/ や ./application.properties をここから探す`,
  envFile: (path: string) =>
    `環境変数を読み込むファイル（${path}）。DB のパスワードなどの秘密はここに書き、ユニットファイル（誰でも読める）や ExecStart に直接書かない。systemd（root）が読むので、ファイルは root だけが読める 600 にできる`,
  execStartSpring: (java: string) =>
    `起動するコマンド。java はフルパス（${java}）で書く（alternatives の切り替えに左右されない。上げるときはここを書き換える）。$JAVA_OPTS は環境変数ファイルの値を空白で区切って渡す`,
  successExit:
    'java は SIGTERM（systemctl stop）で止まると終了コード 143 を返す。正常な停止として扱わせる（無いと stop のたびに failed になる）',
  restart:
    '異常終了したときだけ自動で起動し直す（systemctl stop で止めたときは起動しない）。always にすると、設定の誤りで落ちるときに起動と停止を繰り返す',
  restartSec: '起動し直すまで 5 秒待つ',
  timeoutStopSpring:
    '止めるときに待つ時間。Spring Boot は既定（3.4 以降）で処理中のリクエストを終えてから止まる（server.shutdown=graceful。最大 30 秒）ので、それより長くする。過ぎると強制終了（SIGKILL）',
  timeoutStopTomcat:
    '止めるときに待つ時間。過ぎると強制終了（SIGKILL）。アプリの終了処理が長いときは延ばす',
  umask: '作るファイルの権限を 640 / フォルダを 750 にする（ほかのユーザーから読めないように）',
  hardening: '以下は守りの設定（アプリに穴があっても、できることを減らす）',
  noNewPrivileges: 'setuid のコマンド（sudo など）で権限を上げられないようにする',
  protectSystem:
    'OS のフォルダ（/usr・/etc・/opt など）をすべて読み取り専用にする。書き込みが要るフォルダだけを ReadWritePaths= などで許す',
  logsDirSpring: (app: string) =>
    `/var/log/${app} を systemd が作り、このユーザーが書けるようにする（ProtectSystem=strict でも書ける）。ログをファイルにも出すときは logging.file.path=/var/log/${app}。ほかに書き込むフォルダがあれば ReadWritePaths= に足す`,
  readWriteTomcat: (base: string) =>
    `書き込みを許すフォルダ（ログ・一時ファイル・JSP のコンパイル結果・war の展開先）。${base} の中のこの 4 つ以外（conf など）は読み取り専用になる`,
  protectHome: '/home・/root を見えなくする',
  privateTmp: 'このサービス専用の /tmp を使う（ほかのプロセスと共有しない。止めると消える）',
  protectKernel:
    'カーネルの設定（/proc/sys など）・カーネルモジュール・cgroup を変えられないようにする',
  install: '[Install] 節: systemctl enable で有効にしたとき、どこから起動されるか',
  wantedBy: 'サーバーの起動時（マルチユーザーの状態）に起動する',

  // ---- Tomcat ----
  envHome: (home: string) =>
    `CATALINA_HOME（Tomcat の本体）。版ごとのフォルダを指すシンボリックリンク（${home}）にしておくと、上げるときはリンクを付け替えて再起動するだけで済み、戻すのもリンクを戻すだけ`,
  envBase: (base: string) =>
    `CATALINA_BASE（設定・アプリ・ログ。${base}）。本体と分けるので、本体を上げても設定と war はそのまま`,
  execStartTomcat: (home: string) =>
    `catalina.sh run で前面で動かす（Type=forking + startup.sh ではなく）。PID ファイルが要らず、systemd が java を直接見張れる。標準出力は journalctl -u tomcat で見られる。止めるのは systemd の SIGTERM で行うので、server.xml のシャットダウンポートは閉じてよい（-1）。本体は ${home}`,
  javaHomeNote:
    'JAVA_HOME は CATALINA_BASE/bin/setenv.sh に書く（ここには書かない。1 か所にまとめる）',

  // ---- 環境変数ファイル ----
  envHeader: (app: string) => `${app} の環境変数。秘密を書くので root だけが読める 600 にする`,
  envProfile: (p: string) =>
    `Spring のプロファイル（${p}）。application-${p}.properties などが読まれる`,
  envJavaOpts:
    'JVM のオプション。ユニットの ExecStart の $JAVA_OPTS に入る。-XX:+ExitOnOutOfMemoryError はメモリ不足になったら止める（中途半端に動き続けず、Restart=on-failure で起動し直す）',
  envPort: (port: number) => `アプリのポート（${port}）。Nginx の転送先と合わせる`,
  envAddress: '127.0.0.1 だけで待ち受ける（外から直接アプリに繋がらず、必ず Nginx を通る）',
  envForward:
    'Nginx の X-Forwarded-Proto・X-Forwarded-For を見て、https の URL・利用者の IP を使う（無いと https のページから http へリダイレクトされる）。Nginx の後ろでだけ使う（直接繋がると偽装できるため、上の 127.0.0.1 とセット）',
  envSecret:
    '秘密（DB のパスワードなど）はここに書く。例: SPRING_DATASOURCE_PASSWORD=…（行頭の # を外して値を書く）',

  // ---- 注意 ----
  warnUser: (u: string) =>
    `専用ユーザーを先に作る: sudo useradd --system --no-create-home --shell /sbin/nologin ${u}`,
  warnSpringFiles: (dir: string, jar: string, user: string) =>
    `jar は root の持ち物にしてアプリから書き換えられないようにする: sudo chown root:${user} ${dir}/${jar} && sudo chmod 640 ${dir}/${jar}`,
  warnEnvFile: (path: string, dir: string) =>
    `環境変数ファイルは root だけが読めるようにする: sudo install -d -m 755 ${dir} && sudo chmod 600 ${path} && sudo chown root:root ${path}`,
  warnReload: (unit: string) =>
    `置いたら sudo systemctl daemon-reload → sudo systemctl enable --now ${unit}。様子は systemctl status ${unit}・journalctl -u ${unit} -f`,
  warnVerify: (path: string) => `書き方の誤りは sudo systemd-analyze verify ${path} で確かめられる`,
  warnJavaUpgrade:
    'Java を上げたら ExecStart の java のパス（/usr/lib/jvm/temurin-<版>-jdk）も書き換える（alternatives の切り替えでは変わらない）',
  warnTomcatOwner: (base: string, user: string) =>
    `CATALINA_BASE の持ち主: conf は root:${user} の 750 / 640（Tomcat から書き換えられない）、logs・temp・work・webapps は ${user} が書ける。例: sudo chown -R root:${user} ${base} && sudo chown -R ${user}:${user} ${base}/{logs,temp,work,webapps}`,
  warnTomcatUpgrade: (root: string) =>
    `上げるときは新しい版を ${root}/apache-tomcat-<版> に展開し、sudo ln -sfn ${root}/apache-tomcat-<版> ${root}/current → sudo systemctl restart tomcat。戻すときはリンクを前の版に戻す`,
};

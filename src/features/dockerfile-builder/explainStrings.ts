// 生成した Dockerfile・.dockerignore の各行の説明と注意（表示文字列。生成は java.ts・node.ts・dockerignore.ts）
export const ex = {
  syntax:
    '1 行目の # syntax=… は、BuildKit の Dockerfile の文法（1.x の最新）を使う宣言（ファイルの先頭に置く）。キャッシュマウント（--mount）や COPY --chmod が使える',

  // ---- Java ----
  fromJdk: (image: string) =>
    `ビルド用のイメージ（JDK 入り）。AS build で名前を付け、後の段から参照する。最終的なイメージには入らない（${image}）`,
  fromBuildTool: (tool: string) =>
    `ビルド用のイメージ（${tool} と JDK 入り）。ラッパーを使わないので、イメージの ${tool} でビルドする`,
  workdirBuild: 'ビルド用の作業フォルダ',
  mvnw: 'Maven ラッパー（./mvnw）をコピーし、実行権限（755）を付ける。Windows で作ったファイルでも実行できるように',
  gradlew:
    'Gradle ラッパー（./gradlew）をコピーし、実行権限（755）を付ける。Windows で作ったファイルでも実行できるように',
  mvnDir: 'ラッパーの設定（使う Maven の版）',
  gradleDir: 'ラッパーの設定（使う Gradle の版）と本体の jar',
  pom: '依存の定義（pom.xml）だけを先にコピーする。ソースだけ変えたときに、次の依存の取得をやり直さない（キャッシュが効く）',
  gradleFiles: (files: string) =>
    `依存の定義（${files}）だけを先にコピーする。ソースだけ変えたときに、次の依存の取得をやり直さない（キャッシュが効く）`,
  mavenDeps:
    '依存を先に取得する。--mount=type=cache で ~/.m2 をビルドの間で使い回す（イメージには残らない）。-B は対話なしのモード',
  gradleDeps:
    '依存を先に取得する。--mount=type=cache で ~/.gradle をビルドの間で使い回す（イメージには残らない）。--no-daemon でビルドが終わったら Gradle を止める',
  src: 'ソースは依存を取得した後でコピーする（ソースの変更で上の段のキャッシュが無効にならない）',
  mavenPackage:
    'jar を作る。テストは CI など別の場所で行う前提で飛ばす（-DskipTests）。Spring Boot のプラグインが実行可能 jar に作り替える',
  gradlePackage:
    'Spring Boot の実行可能 jar だけを作る（bootJar）。build にすると plain jar（依存を含まない jar）もでき、どちらを使うか迷う原因になる',
  mavenJar:
    '実行可能 jar を app.jar という名前にする。元の jar は *.jar.original になるので target/*.jar は 1 つ。2 つ以上あると cp が失敗して気づける',
  gradleJar:
    'bootJar の jar を app.jar という名前にする。build/libs に jar が 2 つ以上あると cp が失敗して気づける',
  fromJre: (image: string) =>
    `実行用のイメージ（JRE だけ。JDK より小さい）。ビルドの道具やソースは入らない（${image}）`,
  workdirApp: '実行用の作業フォルダ',
  javaUser:
    'root 以外のユーザー（app）を作る。--system でログインできないシステムユーザーにする。アプリに穴があっても root の権限を取られない',
  copyFromBuild: 'ビルド用の段で作った jar だけをコピーする',
  jarArg: (path: string) =>
    `コピーする jar の場所（${path}）。違う jar を使うときは docker build --build-arg JAR_FILE=… で変えられる`,
  jarArgGradle:
    'コピーする jar の場所。Gradle の build では plain jar（*-plain.jar）もできるため、bootJar で作るか、--build-arg JAR_FILE=build/libs/<名前>.jar で 1 つに絞る',
  copyJar:
    '手元でビルドした jar を app.jar としてコピーする。一致する jar が 2 つ以上あるとエラーになる',
  springProfile: 'Spring のプロファイル（spring.profiles.active を環境変数で指定）',
  serverPort: 'Spring Boot の待ち受けポート（server.port を環境変数で指定。8080 以外のとき）',
  javaEntrypoint:
    'exec 形式（["…"]）で起動する。シェルを挟まないので docker stop の合図（SIGTERM）が Java に届き、正しく終了する。-XX:MaxRAMPercentage=75 でヒープをコンテナのメモリの 75% までにする',

  // ---- Node ----
  fromNodeBuild: (image: string) =>
    `ビルド用のイメージ。AS build で名前を付け、後の段から参照する。開発用の依存はここだけで使う（${image}）`,
  fromNode: (image: string) =>
    `実行用のイメージ（slim。不要なものを減らした Debian）。ビルドの道具やソースは入らない（${image}）`,
  corepack:
    'Node に付いている Corepack で pnpm を使えるようにする（package.json の packageManager の版を使う）',
  packageFiles: (files: string) =>
    `依存の定義（${files}）だけを先にコピーする。ソースだけ変えたときに、次の依存の取得をやり直さない（キャッシュが効く）`,
  npmCiAll:
    '開発用も含めて依存を入れる（ビルドに必要）。npm ci はロックファイルどおりに入れる。--mount=type=cache でダウンロードを使い回す',
  pnpmAll:
    '開発用も含めて依存を入れる（ビルドに必要）。--frozen-lockfile でロックファイルどおりに入れる。--mount=type=cache でストアを使い回す',
  copyAll: 'ソースをコピーする（node_modules・.env などは .dockerignore で除く）',
  runBuild: (pm: string) => `ビルドする（package.json の build スクリプト。${pm} run build）`,
  nodeEnv: 'NODE_ENV=production。ライブラリが本番用の動き（ログの抑制・キャッシュなど）になる',
  nodePort: 'アプリが process.env.PORT を読むなら、この値で待ち受ける（読まないなら不要）',
  npmCiProd:
    '本番用の依存だけを入れる（--omit=dev。テストやビルドの道具を入れずにイメージを小さくする）',
  pnpmProd:
    '本番用の依存だけを入れる（--prod。テストやビルドの道具を入れずにイメージを小さくする）',
  copyOut: (dir: string) => `ビルド用の段で作った ${dir} だけをコピーする`,
  copyOutLocal: (dir: string) => `手元でビルドした ${dir} をコピーする（先にビルドしておく）`,
  nodeUser: 'イメージに最初からいる root 以外のユーザー（node）で動かす',
  nodeEntrypoint:
    'exec 形式（["…"]）で node を直接起動する。シェルを挟まないので docker stop の合図（SIGTERM）が node に届く',
  npmStartEntrypoint:
    'npm start（package.json の start スクリプト）で起動する。npm を挟むため、終了の合図の扱いは node を直接起動するより劣る',

  // ---- 共通 ----
  timezone:
    'タイムゾーン（ログの時刻など）。Java・Node は自前のタイムゾーンのデータを持つので、TZ だけで日本時間になる',
  expose:
    'このポートで待ち受けることの宣言（説明のため。実際に公開するのは docker run -p・compose の ports）',
  healthcheckCurl: (url: string) =>
    `30 秒ごとに ${url} を確かめ、3 回続けて失敗したら unhealthy にする。curl が入っていないイメージでは常に失敗する（注意を参照）`,
  healthcheckNode: (url: string) =>
    `30 秒ごとに ${url} を確かめ、3 回続けて失敗したら unhealthy にする。slim のイメージには curl・wget が無いため、node の fetch で確かめる`,
};

/** .dockerignore の各まとまりの説明 */
export const ignoreEx = {
  allowAll: 'いったんすべてを除き、必要なものだけを ! で戻す（手元でビルドした jar だけを送る）',
  allowJar: (path: string) =>
    `手元でビルドした jar（${path}）だけを戻す。.env などの秘密情報は送られない`,
  vcs: 'Git の履歴・IDE の設定。イメージに不要で、送る量が増えるだけ',
  mavenOut: 'Maven のビルドの成果物（イメージの中でビルドし直す）',
  gradleOut: 'Gradle のビルドの成果物とキャッシュ（イメージの中でビルドし直す）',
  nodeModules: '手元の node_modules（イメージの中で入れ直す。OS が違うと動かないものがある）',
  nodeOut: (dir: string) => `手元のビルドの成果物（${dir}。イメージの中でビルドし直す）`,
  secrets:
    '.env（パスワードなどの秘密情報）をイメージに入れない。入れると、イメージを渡した人に見える',
  logs: 'ログ・テストの結果・OS が作るファイル',
};

/** Dockerfile の上に並べる注意 */
export const warn = {
  wrapperCrlf: (file: string) =>
    `${file} の改行が CRLF（Windows の改行）だと「/bin/sh^M: bad interpreter」などで失敗します。.gitattributes に「${file} text eol=lf」を書いて LF にしてください（実行権限は COPY --chmod=755 で付けています）`,
  curl: 'HEALTHCHECK は curl を使います。eclipse-temurin のイメージに curl が入っていないと常に unhealthy になります。docker run で確かめるか、compose 側の healthcheck（compose の組み立て）を使ってください',
  gradlePlain:
    'Gradle の build タスクでは plain jar（*-plain.jar）もできるため、JAR_FILE が 2 つに一致してエラーになることがあります。bootJar で作るか、build.gradle で jar タスクを止める（jar { enabled = false }）か、--build-arg JAR_FILE=… で 1 つに絞ってください',
  prebuiltJava: (command: string) =>
    `先に手元で jar を作ってから docker build してください（${command}）`,
  prebuiltNode: (command: string) =>
    `先に手元でビルドしてから docker build してください（${command}）`,
  npmStart:
    'npm start で起動すると、docker stop の合図が node に届くまでに npm を挟みます。可能なら node <ファイル> で直接起動してください',
  pin: (reviewed: string) =>
    `イメージのタグはメジャーバージョンまで（版の情報は ${reviewed} 時点）。版を固定したいときは、細かいタグ（例: 21.0.5_11-jre）かダイジェスト（@sha256:…）を書いてください`,
};

// Spring Boot の設定変換の表示文字列（将来の i18n 用にここへ集める）
export const strings = {
  title: 'Spring Boot の設定変換',
  description:
    'application.properties・application.yml・環境変数を相互に変換し、DB 接続の設定の雛形とプロファイルの分け方を出します。',
  lead: '設定を貼り付けると、ほかの形式に変換します。結果はコピーするか、新しいエディタで開くだけで、ファイルは書き換えません。',
  tabsLabel: '設定変換の種類',
  tabConvert: '変換',
  tabDatasource: 'DB 接続の雛形',
  tabProfiles: 'プロファイル',

  convert: {
    inputLabel: '設定を貼り付け',
    placeholder: 'spring.datasource.url=jdbc:postgresql://localhost:5432/app',
    notSaved: '貼り付けた内容は保存しません（パスワードなどが残らないように）。',
    formatLegend: '貼り付けた形式',
    formatAuto: '自動',
    formats: { properties: 'properties', yaml: 'YAML', env: '環境変数' },
    detected: (name: string) => `判別した形式: ${name}`,
    envFormatLabel: '環境変数の書き方',
    envFormats: {
      compose: 'compose の environment:',
      dotenv: '.env',
      bash: 'bash（export）',
      powershell: 'PowerShell（$env:）',
    },
    example: '例を入れる',
    clear: 'クリア',
    empty: '設定を貼り付けると、ここにほかの形式が表示されます。',
    notesLabel: '変換の注意',
    errorPrefix: '変換できません',
    exampleText: [
      '# DB の接続先',
      'spring.datasource.url=jdbc:postgresql://localhost:5432/app',
      'spring.datasource.username=app',
      'spring.datasource.password=${DB_PASSWORD}',
      'spring.jpa.open-in-view=false',
      'app.cors.allowed-origins[0]=https://example.com',
      'app.cors.allowed-origins[1]=https://www.example.com',
      'app.feature.mode=on',
    ].join('\n'),

    commentsLost: '# のコメントは変換で失われます。必要なら変換した後に書き直してください。',
    yaml11Note:
      'Spring Boot は YAML を SnakeYAML（YAML 1.1 寄り）で読むため、引用符の無い on / off / yes / no は真偽値（true / false）、010 は 8 進数になります。文字列のまま渡したい値は引用符で囲みます。',
    yaml11Quoted:
      'on / off / yes / no は引用符で囲みました（囲まないと Spring Boot は真偽値 true / false として読みます）。',
    yaml11BoolRead: (source: string, text: string) =>
      `引用符の無い ${source} は真偽値 ${text} として読まれます（文字列にするなら '${source}' と囲む）`,
    yaml11NumberRead: (source: string, text: string) =>
      `引用符の無い ${source} は数値 ${text} として読まれます（文字列にするなら '${source}' と囲む）`,
    nonAscii:
      'properties では日本語などを \\uXXXX の形にしました（Java の properties は本来 ISO-8859-1 で読むため）。日本語のまま書きたいときは YAML を使ってください。',
    secret: (key: string) =>
      `${key} に値が書かれています。パスワードなどは環境変数や .env（git に入れない）に分け、設定ファイルには \${DB_PASSWORD} のように書きましょう。`,
    multiDocYaml: (count: number) =>
      `${count} つの文書（--- の区切り）があります。properties では #---（Spring Boot 2.4 以降）で区切りました。プロファイルごとに application-<名前>.properties に分けることもできます。`,
    multiDocEnv:
      '環境変数にはプロファイルごとの分け方が無いため、1 つ目の文書だけを変換しました。プロファイルのときの値は、その環境で別に設定してください。',
    docHeading: (n: number, profile?: string) =>
      profile
        ? `ここから ${n} つ目の文書（プロファイル ${profile} のときだけ使われる）`
        : `ここから ${n} つ目の文書`,
    envGuess:
      '環境変数の名前からキーを推測しました。_ が「.」か「-」かは名前から分からないため、説明の列の「推測」の行は Spring Boot のドキュメントで確かめてください。',
    composeDollar:
      'compose は $ を自分の変数に置き換えるため、値の $ は $$ にしました（Spring Boot には $ として渡ります）。',
    composeService: 'アプリのサービス名に合わせる（compose.yaml の services: の下に入れる）',
    guessedFrom: (name: string) => `推測（${name} から）`,
    knownFrom: (name: string) => `よく使うキーと一致（${name} から）`,

    badUnicodeEscape: (line: number) =>
      `${line} 行目: \\u の後ろが 16 進数 4 桁ではありません（Java では読み込みエラーになります）。この行は飛ばしました。`,
    trailingSpace: (key: string, line: number) =>
      `${line} 行目: ${key} の値の末尾に空白があります（Java の Properties では残り、Spring Boot では取り除かれます）。`,
    duplicateKey: (key: string, first: number, line: number) =>
      `${key} が 2 回あります（${first} 行目と ${line} 行目）。後のほうの値が使われます。`,
    badKey: (key: string) =>
      `${key} はキーの形が正しくないため、そのままの名前で 1 つのキーにしました。`,
    shapeConflict: (key: string) =>
      `${key} に値と入れ子（下の階層）の両方があり、YAML では表せません。後に書かれたほうを残しました。`,
    listGap: (index: number) =>
      `リストの ${index} 番目が無いため、空の値（''）で埋めました。番号は 0 から続けて書いてください。`,
    nonStringKey: (key: string, text: string) =>
      `キー ${key} は引用符が無いため ${text} として読まれ、Spring Boot では [${text}] というキーになります。文字列のキーにするなら引用符で囲んでください。`,
    emptyMap: (key: string) => `${key} は空のマップ（{}）のため、properties には出しません。`,
    yamlError: (message: string) => `YAML を読めませんでした: ${message}`,
    yamlTooLong:
      'YAML が長すぎます（100 万文字まで）。画面が止まらないよう、設定ファイルの一部ずつ入れてください。',
    yamlTooMany:
      'YAML の値が多すぎます（展開すると 1 万個を超えます）。エイリアス（*名前）で同じ値を何度も展開している可能性があります。画面が止まらないよう、ここで読むのを止めました。',
    yamlNotMap: (n: number) =>
      `${n} つ目の文書が「キー: 値」の形ではありません（Spring Boot の設定は最上位がマップです）。`,
    envLossy: (key: string) =>
      `${key} は環境変数では正確に表せません（[a.b] のようなマップのキーや記号は、環境変数の名前では区別できません）。`,
    envCollision: (a: string, b: string, name: string) =>
      `${a} と ${b} は同じ環境変数 ${name} になります。`,
    envUnreadable: (line: number, text: string) =>
      `${line} 行目は環境変数として読めないため飛ばしました: ${text}`,
  },

  datasource: {
    lead: 'DB と接続先を選ぶと、spring.datasource と spring.jpa の設定を 3 つの形式で出します。パスワードは書かず、${DB_PASSWORD}（環境変数）にします。',
    dbLegend: 'DB',
    dbs: { postgresql: 'PostgreSQL', mysql: 'MySQL' },
    targetLegend: 'アプリをどこで動かすか',
    targets: {
      compose: 'compose の中（コンテナ）から',
      local: '手元（PC）から',
    },
    hostLabel: 'ホスト名',
    portLabel: 'ポート',
    databaseLabel: 'DB 名',
    usernameLabel: 'ユーザー',
    invalid: '入力を確かめてください',
    hostError: 'ホスト名は英数字・「.」「-」で書いてください。',
    portError: 'ポートは 1〜65535 の数字で書いてください。',
    databaseError: 'DB 名は英数字・「_」「-」で書いてください。',
    usernameError: 'ユーザーは英数字・「_」「.」「-」で書いてください。',

    urlPostgres: 'JDBC URL（jdbc:postgresql://ホスト:ポート/DB 名）',
    urlMysql:
      'JDBC URL（jdbc:mysql://ホスト:ポート/DB 名?パラメータ）。serverTimezone は日時を何時の時刻として扱うか',
    hostCompose:
      'ホストは compose のサービス名（コンテナの中の localhost はアプリ自身のコンテナを指す）。ポートはコンテナの中のポート',
    hostLocal: 'ホストは localhost。DB をコンテナで動かすなら compose の ports: で公開したポート',
    username: 'DB のユーザー',
    password:
      'パスワードは書かず、環境変数 DB_PASSWORD から読む（${...} は Spring Boot が置き換える）',
    passwordCompose: 'compose が .env か環境変数の DB_PASSWORD に置き換える',
    passwordEmpty: 'ここにパスワードを入れる（このファイルは git に入れない）',
    ddlAuto:
      'テーブルを自動で作り変えない。validate はエンティティと表の食い違いを起動時に見つける（既定は none。update / create-drop は手元の試しだけ）',
    openInView: 'Web のリクエストの間 DB の接続を持ち続けない（既定の true は起動時に警告が出る）',

    warnings: {
      driver:
        'ドライバー（spring.datasource.driver-class-name）は URL から自動で決まるため、通常は書きません。依存（pom.xml / build.gradle）にドライバーを入れてください。',
      mysqlParams:
        'MySQL の URL のよく使うパラメータ: serverTimezone（時刻の扱い）・characterEncoding=UTF-8・useSSL=false と allowPublicKeyRetrieval=true（手元の開発だけ。「Public Key Retrieval is not allowed」のとき）。',
      composeHost:
        'compose の中からは localhost ではなくサービス名（例: db）で繋ぎます。compose.yaml のサービス名に合わせてください。',
    },
  },

  profiles: {
    lead: 'プロファイル（local・docker・prod など、動かす環境ごとの設定のまとまり）の名前を並べると、ファイルの分け方と指定のしかたを出します。',
    namesLabel: 'プロファイルの名前（空白かカンマで区切る）',
    namesDefault: 'local docker prod',
    activeLabel: '有効にするプロファイル',
    invalidName: (name: string) =>
      `${name} はプロファイルの名前に使えません（英数字・「_」「-」で書いてください）。`,
    duplicateName: (name: string) => `${name} が 2 回あります。`,
    defaultName:
      'default は「何も指定しないとき」のプロファイルの名前として Spring Boot が使います。別の名前にしてください。',
    noNames: 'プロファイルの名前を 1 つ以上入れてください。',
    filesHeading: 'ファイルの分け方',
    priorityHeading: '優先順位（下ほど強い）',
    priority: [
      'application.yml（全プロファイルに共通）',
      'application-<名前>.yml（そのプロファイルのときだけ。同じキーは application.yml を上書きする）',
      '複数のプロファイルを有効にしたときは、後に書いたプロファイルのほうが強い（local,debug なら debug）',
      '同じ場所に .properties と .yml があれば .properties のほうが強い（どちらか一方にそろえる）',
      '環境変数（SPRING_DATASOURCE_URL など）はファイルより強い',
      'コマンドラインの引数（--server.port=9090 など）がいちばん強い',
    ],
    commandsHeading: (name: string) => `${name} を有効にする方法`,
    commonExplain: '全プロファイルに共通の設定はここに書く',
    nameExplain: 'アプリの名前（ログなどに出る）',
    defaultExplain: (name: string) =>
      `何も指定しないときに使うプロファイル（${name}）。spring.profiles.active を指定するとそちらが使われる`,
    profileExplain: (name: string) =>
      `例: ${name} のときだけ変える設定。application.yml の同じキーを上書きし、書かないキーは application.yml の値のまま`,
    commands: {
      jar: { label: 'jar を実行するとき', note: '' },
      envBash: { label: '環境変数（bash）', note: '' },
      envPowershell: { label: '環境変数（PowerShell）', note: '' },
      compose: {
        label: 'compose の environment:',
        note: 'コンテナで動かすときは compose.yaml のアプリのサービスに書く',
      },
      mavenBash: { label: 'Maven（bash）', note: '' },
      mavenPowershell: {
        label: 'Maven（PowerShell）',
        note: 'PowerShell では -D… を引用符で囲む（囲まないと「.」の所で引数が分かれる）',
      },
      gradleBash: { label: 'Gradle（bash）', note: '' },
      gradlePowershell: { label: 'Gradle（PowerShell）', note: '' },
      vscode: {
        label: 'VS Code（launch.json）',
        note: 'Java の拡張機能の起動の設定に args を足す（mainClass は自分のアプリのクラスに）',
      },
    },
    ideNote:
      'IntelliJ IDEA では実行構成の「Active profiles」欄に名前を入れます。複数はカンマで区切ります（local,debug）。',
    copyLabel: (label: string) => `${label}をコピー`,
  },
};

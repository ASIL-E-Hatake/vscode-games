# 続けたくなる仕組み — 日替わりチャレンジ・ゲーム内実績・ランダム縛り

> ステータス: ドラフト（2026-10-20）。v0.6.0 の共通基盤（この文書の 2 章）を先に 1 つの PR で入れ、各機能（3〜5 章）はその後に並行して作る（[ロードマップ](roadmap.md)）。
> 「案」と書いた項目は未決。各機能の担当が決め、決めたらこの文書を更新する。

## 1. 目的と方針

一通り遊べるようになった利用者に、**毎日開く理由**（日替わりチャレンジ）と**続ける目標**（実績）、**同じゲームを違う遊び方で遊ぶ理由**（ランダム縛り）を加える。

| 方針 | 内容 |
|---|---|
| 通信しない | 「全員同じお題」は日付をシードにした乱数で作る（サーバー不要）。結果の共有はクリップボードにコピーするだけ |
| ゲームごとに判定を書かない | ゲーム・機能は「出来事」を記録するだけ。実績の判定は共通の純粋関数がコンテンツの定義を見て行う |
| 生ログを持たない | 出来事は回数・最大値の**カウンター**として保存する（保存量が増え続けない・個人の行動履歴を細かく残さない） |
| 既存の記録を壊さない | 日替わり・縛りの記録は自己ベスト（`score`）・ゴーストとは別に保存する。既存のモード（`legacy`・`levels`・問題パック）の動きは変えない |
| 控えめに | 実績の獲得通知は短く（ステータスバー程度）。点滅させない。研修中の集中を妨げない |

## 2. 共通基盤（この PR）

### 2.1 出来事の記録（カウンター）— `src/core/counters.ts`・`src/core/progress.ts`

- 出来事 = `{ name, op?: 'add' | 'max', value?: number }`。`add`（既定）は値を足す、`max` は最大値を残す。`value` は 0 以上の整数（既定 1、上限 10 億）。
- カウンター名: 「.」区切りの小文字英数字とハイフン（例: `game-typing.lines.java`）。96 文字まで。
- 保存: `AppServices.progress`（`ProgressService`）が `ScopedStorage(store, 'core')` に保存する。

  | キー | 内容 |
  |---|---|
  | `hatake-gottani.core.counters` | `{ [カウンター名]: 数値 }` |
  | `hatake-gottani.core.achievements` | `{ [実績 ID]: { at: ISO 8601 } }`（獲得日時） |

  scope を `core` にしたのは、Webview の `storage/set`（機能 ID の scope にしか書けない）から書き換えられないようにするため。

#### 自動で記録する出来事（ホスト側。ゲームは何もしなくてよい）

| カウンター | いつ | 記録する場所 |
|---|---|---|
| `<featureId>.plays` / `<featureId>.plays.<記録のモード ID>` | `score/submit`（日替わりは `daily/submit`）のたび | `messageHandler.ts` |
| `games.plays` | 上のうち category が `game` の機能 | 同上 |
| `<featureId>.best` / `games.best` | 自己ベストを更新したとき（**最初の記録は数えない**） | 同上 |
| `feature.opened.<featureId>` | 機能を開いたとき（コマンドの機能も含む） | `extension.ts` の `openFeature` |
| `glossary.percent` / `glossary.found`（max） | 図鑑で新しく発見したとき・起動時 | `extension.ts` |
| `<featureId>.daily` | その機能の日替わりの、その日最初の記録 | `messageHandler.ts` |
| `daily.days` | どれかの日替わりで、その日最初の記録（参加日数） | 同上 |
| `daily.streak`（max） | 日替わりの記録のたび（どれかの日替わりへの連続参加日数） | 同上 |

#### ゲーム固有の出来事（Webview から送る）

```ts
import { bridge } from '../../../webview-shared/bridge';
bridge.recordEvent('lines.java');             // game-typing から → game-typing.lines.java が 1 増える
bridge.recordEvent('max-combo', 23, 'max');   // 最大値を残す
bridge.recordEvents([{ name: 'perfect' }, { name: 'lines.java', value: 12 }]); // まとめて（1 回 20 件まで）
```

- メッセージ `progress/record`（`src/core/messages.ts`）。ホストが**名前の先頭に送り元の機能 ID を付ける**ので、ほかの機能のカウンターや自動の記録は名乗れない。
- 予約語: 機能 ID の直後が `plays` / `best` / `daily` の名前は Webview から送れない（自動の記録と二重に数えないため）。
- ホスト側（`register()`・`activate()`）で記録するときは `ctx.app.progress.record([{ name: '<featureId>.<名前>' }])`。

#### 名前の約束（後の担当が使う予定のもの）

| カウンター | 内容 | 担当 |
|---|---|---|
| `game-typing.lines.<言語>` | 打ち終えたお題の数 | 実績 |
| `game-reaction.perfect` | Go/No-Go をノーミスで終えた回数 | 実績 |
| `<featureId>.perfect` | ノーミス・全問正解で終えた回数（クイズ系） | 実績 |
| `<featureId>.max-combo`（max） | 最大コンボ（game-kit で自動にするかは案: 4.4） | 実績 |
| `<featureId>.modifier.<縛り ID>` | 縛りで遊んだ回数 | ランダム縛り |

### 2.2 実績の定義と判定 — `content/achievements/*.yaml`・`src/core/achievements.ts`

```yaml
version: 1
achievements:
  - id: explorer              # kebab-case。獲得の記録のキーなので後から変えない
    title: 寄り道上手
    description: 10 種類の機能を開いた。     # 獲得後に見せる
    hint: いろいろな機能を開いてみる         # 未獲得のときに見せる（省略時は description）
    category: explore          # game / reference / daily / explore
    icon: compass              # codicon
    secret: false              # true なら未獲得のあいだ名前とヒントを隠す
    all:                       # すべて満たす（any はどれか 1 つ。併用可）
      - counter: feature.opened.*   # 末尾「.*」はその接頭辞で始まるカウンターをまとめる
        aggregate: count            # sum（合計。既定）/ count（値が 1 以上の数 = 種類の数）
        atLeast: 10
```

- スキーマ: `content/schemas/achievements.schema.json`。追加チェック（`checkAchievementFile`）で id の重複・カウンター名の形式を検査する。
- 判定: `evaluateAchievements(定義, カウンター, 獲得済み, 日時)`（純粋関数）。`ProgressService.record()` が記録のたびに呼ぶ。一度獲得した実績は、定義を変えても取り消さない。
- 新しく獲得したとき: `app.progress.onDidUnlock((added) => …)`（`{ dispose() }` を返す）。今は開いているパネルの表示を更新するだけ。**通知の見せ方は実績の担当**。
- 一覧画面用のデータ: `app.progress.view()` → `{ achievements: [{ definition, unlockedAt?, progress: { all, any } }], unlockedCount, total }`（`progress` は条件ごとの現在値・目標・達成済みか）。
- この PR では定義はサンプル 5 件だけ（はじめの一歩・自己ベスト更新・10 種類の機能・図鑑 50%・日替わり 7 日連続）。

### 2.3 日替わり — `src/core/daily.ts`・`src/core/dailyBoard.ts`・`src/webview-shared/game-kit/dailyPlay.ts`

#### 日付とシード

- 日付は**日本時間（UTC+9）固定の日付**（日本時間の 0:00 で切り替わる。D7）。`jstDateKey(new Date())` → `YYYY-MM-DD`。PC のタイムゾーン設定に関係なく全員同じ日付になる。
- シード: `dailySeed(日付, salt)` = `` `${日付}:${salt}` `` の FNV-1a（32bit）。salt は `<featureId>:<variant>`（game-kit が付ける）。乱数は `mulberry32(seed)`。
  **この形式を変えると全員のお題が変わる**ので変えない（L1 で値を固定して検査している）。

#### 記録

- 1 日 1 回: **その日最初のプレイだけが記録**になり、2 回目以降は「練習」（回数だけ数える）。自己ベスト（`score`）・ゴーストには入れない（毎日お題が変わり難しさをそろえられないため）。
- 遊んだお題の日付で記録する。日付をまたいで終わったプレイのため、**今日と昨日**の日付を受け付ける（`isAcceptableDailyDate`）。

  | キー | 内容 |
  |---|---|
  | `hatake-gottani.<featureId>.daily`（`variant` があれば `daily.<variant>`） | `{ version: 1, results: { [日付]: { score, at, attempts } }, lastDate, streak, bestStreak, days }`。results は新しい方から 30 日分 |
  | `hatake-gottani.core.daily` | どれかの日替わりへの参加: `{ lastDate, streak, bestStreak, days }` |

- 連続参加日数: 前回の参加日の翌日なら +1、2 日以上空いたら 1 からやり直し。今日の時点では「昨日まで参加していて今日まだ」なら続いている扱い（`currentStreak`）。
- 共有用の文字列: `dailyShareText({ title, date, score, streak, extra })` → `#ごった煮チャレンジ 2026-10-19 コードタイピング: 61 WPM / 正確率 98% / 3 日連続`（1 行）。

#### ゲームへの組み込み手順（日替わりチャレンジの担当）

1. `feature.ts` の `score` に `daily: true` を足す（`initData: gameInitData('<id>')` のままでよい。今日の状態 `GameInitData.daily` が自動で入る）。
2. `runGame({ daily: { mode, level, rules?, variant?, shareExtra? } })` を足す。
   - `mode` / `level`: 日替わりで遊ぶモード・レベル（**全員同じお題にするため固定**。モードがあるゲームでは必ず指定）。シーンには `ctx.mode` / `ctx.level` としてこの値が渡る。
   - `shareExtra(details)`: 共有の文字列に足す短い情報（結果画面の details から作る）。
3. シーンでお題を作るとき、`ctx.daily` があれば `Math.random` の代わりに `ctx.daily.random` を使う（お題の生成だけに使う。演出に使うと同じ日でもお題がずれる）。
   - 乱数を注入できるロジック（`.claude/rules/games.md`）なら `createPuzzle(size, ctx.daily?.random ?? Math.random)` のように渡すだけ。
4. あとは game-kit が行う: ルール説明の「遊び方を選ぶ: いつもの / 今日のチャレンジ」（ホストから今日の状態が届いたときだけ表示）、今日のチャレンジ中はモード・レベル・ゴーストの選択を隠す、`daily/submit` での記録、結果画面の「今日の記録になりました / 練習でした」「結果をコピー」、ルール説明の今日の記録・連続日数。
5. L3: `webview.open(id, { data: { ...初期データ, daily: { date, streak: 0, totalStreak: 0 } } })` で日替わりを出せる。`daily/submit` の応答は `dailyReply` で変えられる（`tests/webview/harness.ts`）。例は `tests/webview/game-kit.spec.ts` の「日替わり」。

- `GameFinish.onRecorded` は日替わりでは呼ばれない（自己ベスト用のため）。
- 日付が変わったときの再表示（ルール説明を開いたまま 0:00 を過ぎた）は、Webview の時計で今日の日付を出し直す。ホストから届いた今日の状態の日付が違えば「今日の記録」は無いものとして扱う。

### 2.4 縛り（modifier）— この PR では実装しない

判断: **game-kit への「縛りを渡す口」はランダム縛りの担当が最初の小さな PR で入れる**（設計は 5 章）。
理由: 縛りの記録は「記録のモード ID × 縛り」になり、ホストのモードの検査（`score.modes` に無いモードは拒否）と自己ベストの保存キーの決め方に関わる。縛りの中身（ゲームごとに何ができるか）と一緒に決めた方が手戻りが少ない。日替わり・実績の担当は game-kit の `index.ts` をほとんど触らない想定なので、衝突は小さい。

## 3. 日替わりチャレンジ（`daily-challenge`）

roadmap の内容: 日付をシードに全員同じお題、1 日 1 回の記録と連続参加日数、ホームに「今日のチャレンジ」カード、結果をクリップボードにコピー。

- 各ゲームに 2.3 の手順で日替わりを足す。対象: スライドパズル（配置）・タイピング（お題の順番）・出力当て・バグ探し（問題の選び方）・ショートカット早押しクイズ。反射神経テストは「同じお題」の意味が薄いので **案: 対象外**（待ち時間の並びだけ同じにする、も可）。
- **ホームのカード**（D1 で B に決定）: 日替わりに対応したゲームを全部並べ（`FeatureDefinition.score.daily` が真のゲーム）、1 行ずつ「✓ 済み（記録）/ ○ 未挑戦」と「挑戦する」ボタンを出す。連続参加日数（`app.daily.totalStreak`）も表示する。
  「挑戦する」は `feature/open` に `target: 'daily'`（`DAILY_TARGET`）を付けて開き、game-kit が「今日のチャレンジ」を選んだ状態でルール説明を出す（すでにルール説明を開いているパネルにも反映。プレイ中は何もしない）。
- **1 日 1 回の扱い（案）**: 今の実装は「何度でも遊べるが記録は最初の 1 回」。「1 回しか遊べない」にする場合は `canStart` で止める（game-kit 側の変更は不要）。
- **問題の数が少ないゲーム**: 日替わりで同じ問題が続かないよう、全問題からシードで選ぶ（難易度は固定しない、等）はゲームごとに決める。
- 問題パックの問題は日替わりに使わない（人によって入っているパックが違い「全員同じ」にならないため）。

### 3.1 ゲームごとの日替わり（実装した内容）

全ゲームで難易度は固定（全員同じお題にするため）。シードの salt は `<機能 ID>:`（言語の選び方は `<機能 ID>:lang`）。**salt の形式を変えると全員のお題が変わるので変えない。**

| ゲーム | 日替わりの内容 | 共有に添える情報 |
|---|---|---|
| コードタイピング | **言語は日付で変わる**（Java / Python / JavaScript / Ruby / Linux の 5 つから `dailyTypingLang`）。難易度「ふつう」。お題の順番が全員同じ。画面の状態表示に今日の言語を出す | 言語・正確率 |
| スライドパズル | 4×4 固定（「ふつう」）。同じ配置（シードで崩した手順） | 手数 |
| ショートカット早押しクイズ | 「ふつう」（60 秒）。出題と選択肢の並びが全員同じ（OS が違う人は、キー表記だけが違う） | 正答率 |
| 出力当てクイズ | **言語は日付で変わる**（4 言語から `dailyQuizLanguage`）。難易度「ふつう」。10 問の選び方・順番・選択肢の並びが全員同じ。シークレット問題は出さない（条件が人によって違うため） | 言語・正解数 |
| バグ探し | **言語は日付で変わる**（4 言語から。出力当てとは別の言語になる）。難易度「ふつう」。8 問の選び方・順番が全員同じ。シークレット問題は出さない | 言語・正解数 |

- 反射神経テストは対象外（D3）。問題パックの問題は使わない（人によってパックが違うため）。
- 言語は日付で変わるため、日替わりのルール説明には言語名を出さず、プレイ中の画面（タイピング）か結果画面（クイズ）に「今日の言語」を出す。
- 同じ版のコンテンツでないと問題が一致しない（版が違う人とは、問題を増やした分だけずれる）。社内は同じ版に更新する前提。
- 苦手の記録（タイピングの苦手・クイズの間違えた問題）は日替わりでも通常どおり記録する。自己ベスト・ゴースト・プレイ回数（`score`）には入れない。

## 4. ゲーム内実績（`achievements`）

- 新しい機能 `src/features/achievements/`（一覧画面）。initData で `app.progress.view()` を渡し、獲得済み / 未獲得（`secret` は「？？？」）、条件のヒントと進み具合（「あと 3 回」）を表示する。
- ホームに獲得数（`unlockedCount / total`）。
- 獲得の通知: `extension.ts` で `app.progress.onDidUnlock` に `vscode.window.setStatusBarMessage('$(trophy) 実績「…」を獲得しました', 4000)` を足す（図鑑の発見の通知と同じ）。**案**: 結果画面の中にも出すか（ホストから Webview へ知らせるメッセージが別に必要）。
- 実績の定義を 20〜30 件に増やす（`content/achievements/`）。各ゲームから 2.1 の「名前の約束」の出来事を送る（例: タイピングは 1 プレイの終わりに ``bridge.recordEvent(`lines.${言語}`, 打ち終えた数)`` をまとめて 1 回）。
- 4.4 **案: 最大コンボの自動記録** — game-kit の `ComboSession` が結果のときに `max-combo`（max）を送れば、各ゲームで書かなくてよい。
- 研修のスタンプカードとしての使い方（「はじめての VS Code」系の実績）は `feature.opened.*` で作れる。

## 5. ランダム縛りプレイ

roadmap の内容: 遊ぶたびに追加ルールがランダムに付く。縛りの記録は通常の自己ベストとは分け、縛りの種類ごとに最高記録を残す。

### 5.1 game-kit の口（担当が最初に入れる。案）

```ts
runGame({
  modifiers: {
    options: [
      { id: 'no-backspace', label: 'Backspace 禁止', rule: 'Backspace を使えません。' },
      { id: 'short', label: '制限時間 30 秒', rule: '制限時間が 30 秒になります。' },
    ],
    appliesTo?: (mode) => boolean,   // 縛りを選べるモード
  },
});
// シーン: ctx.modifier（今回の縛りの ID。縛りなしは undefined）を見てルールを変える
```

- ルール説明に「ランダム縛り」のチェック（オン / オフ。保存する）。オンなら**スタートのたびに** `options` から 1 つ選ぶ（`Math.random`。日替わりと組み合わせるときは `ctx.daily.random` ではなく `dailySeed(日付, 'modifier')` で「今日の縛り」を決める）。選んだ縛りはカウントダウンの前に見せる。
- **記録（案）**
  - A（推奨）: `score/submit` に `modifier` を足し、ホストは `score.<記録のモード>~<縛り ID>` に保存する（`score.modifiers` に縛り ID を並べ、知らない縛りは拒否）。ホームの自己ベストには出さない。`~` は今のモード ID・ストレージキーに使えない文字なので既存の記録と衝突しない（ゴーストを使うなら `isValidStorageKey` の許可文字も見直す）。
  - B: 縛りごとに `score.modes` を増やす（`levels` の `recordMode` で `<mode>.<縛り>` を作る）。ホスト側の変更は不要だが、モードの数が「モード × レベル × 縛り」に増え、ホームの自己ベストの表示もまとめ直しが必要。
- 縛りで遊んだ回数は `<featureId>.modifier.<縛り ID>` を実績用に送る。
- ゴースト・コンボは縛り中も使える（ゴーストは縛りごとに分けるか、使わない。案）。

## 6. 決定事項（2026-10-20）

最初は「案」だった点。試用のフィードバックで変えてよい。

| # | 項目 | 決定 | 理由 |
|---|---|---|---|
| D1 | ホームの「今日のチャレンジ」 | B: 対応ゲームを全部並べる（1 行ずつ、済み / 未の印と連続参加日数） | どれを遊ぶかは利用者が選べる方がよい |
| D2 | 1 日 1 回の扱い | 何度でも遊べて、記録はその日最初の 1 回（実装済み） | 練習を止めない。会話のネタは「最初の 1 回」で揃う |
| D3 | 反射神経テストの日替わり | 対象外 | 待ち時間を揃えても実力差がほぼ出ず、覚えられると意味が無い |
| D4 | 実績の獲得の知らせ方 | ステータスバーに数秒＋ゲームの結果画面にも出す（メッセージ追加） | 通知ポップアップは邪魔になるため使わない |
| D5 | 最大コンボの自動記録 | game-kit で自動（`<id>.combo` に max） | 各ゲームに書かずに済む |
| D6 | 縛りの記録の保存先 | A: `score.<mode>~<縛り>`（ホストに modifier を追加） | モードの一覧（選択画面・ホーム）が縛りの数だけ増えない |
| D7 | 日付 | **日本時間（UTC+9）で固定**し、0:00 に切り替える | 「全員同じお題」をどの PC の設定でも保つ（海外のタイムゾーンの PC でも揃う） |

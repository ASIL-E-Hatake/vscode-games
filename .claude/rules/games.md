---
paths:
  - "src/features/game-*/**"
  - "src/webview-shared/game-kit/**"
---

# ゲーム実装ルール

- 1 プレイ 1〜3 分に収める。制限時間またはラウンド数で必ず終わる設計にする。
- 画面遷移は game-kit の共通フロー（ルール説明 → カウントダウン → プレイ → 一時停止 → 結果）を使う。独自の結果画面を作らない。
- ロジック（ルール・判定・スコア計算・盤面生成）は `logic.ts` 等の DOM 非依存モジュールに置き、`*.test.ts` を書く。
  - 乱数は引数で注入できるようにする（テストと日替わりモードのシード固定のため）。
- 描画ループは `requestAnimationFrame` を使い、一時停止中は止める。`setInterval` で描画しない。
- 時刻の正確さが必要な判定（合図・制限時間など）は描画ループではなく、その時刻に合わせた `setTimeout` で行う（描画ループは最大 1 フレーム遅れる）。
- L3 テストでは `page.clock` で時計を止め（`install` → `pauseAt`）、`runFor` で時間を進める。乱数は `webview.open(..., { random })`（固定値）または `{ seed }`（`tests/shared/random.ts` のシード付き乱数）で固定する。
- 難易度・言語などで記録を分けるときは `score.modes`（`feature.ts`）と `runGame({ modes })` を使う。独自にキーを分けて保存しない。
  - 既存のゲームに後からモードを足すときは、従来の遊び方のモードに `legacy: true` を付け、モード導入前の記録（キー `score`）を引き継ぐ（例: `game-reaction` の「通常」）。`runGame` の `modes` にも同じ `legacy: true` を付けると、ゴーストもモード導入前のキー `ghost` を読み書きする（例: `game-shortcut-quiz` の「ふつう」）。
  - 言語 × 難易度のように 2 つの軸を別々に選ばせるときは `runGame({ levels })` を使い、`levels.recordMode(mode, level)` で記録のモード ID を作る（`score.modes` にはその ID をすべて並べる。`group` を付けるとホームはグループごとに 1 行）。既存の記録を引き継ぐ難易度はモードの ID をそのまま返す（例: `game-typing` の「ふつう」= `java`）。シーンでは `ctx.level` を見る。
  - 条件を満たさないと始められないモード（例: 苦手が 0 件の苦手復習）は `runGame({ canStart })` で「スタート」を押せなくする。
- ゴースト対戦: `runGame({ ghost: true })` にし、シーンで経過の値（大きいほど進んでいる値。例: 入力済み文字数）を値が変わるたびに `ctx.ghost.track(value)` で報告し（最初の値も報告する）、`ctx.ghost.view({ target, unit })` が返す要素を画面に置く。時刻の計測・間引き・自己ベスト時の保存・ルール説明の「ゴーストを表示する」は game-kit が行うので、ゲーム側で保存しない。
  - 値が「進み具合」でないゲーム（例: 反射神経テスト）は進捗バーを使わず、`ghost: { toggleHint }` で「ゴーストを表示する」の説明を差し替え、`ctx.ghost.isVisible()` がオンのときだけ結果画面で自己ベスト時と比べる。自己ベスト時だけ保存したいデータは `GameFinish.onRecorded(summary)` で `summary.isNewBest` を見て `bridge.save` する（例: `game-reaction` の `bestRounds.<mode>`）。
- コード問題（コードを読んで答える 4 択・行の選択）は quiz-kit（`src/webview-shared/quiz-kit`）を使う。`createScene: (ctx) => createCodeQuizScene(ctx, { kind, questions: filterQuestions(全問題, { language, difficulty }), count, timeLimitMs })` とし、ゲーム側は問題の絞り込み・モード・（必要なら）`result` で結果画面の内容だけを書く。
  言語 × 難易度で記録を分けるときは `CODE_QUIZ_SCORE_MODES`（`score.modes`）と `codeQuizRecordMode`（`levels.recordMode`）を使う（`src/core/codeQuizSession.ts`）。問題の種類を増やすときは `QuizKind` を実装する。
- 問題パック（利用者が追加した問題。`docs/06-content-pack.md`）に対応するゲームは、`runGame` の `modes` に `CONTENT_PACK_PLAY_MODE`、`score.modes` に `CONTENT_PACK_SCORE_MODE` を足し、initData で `contentPack: packs.info.<種類>` とパックの問題（`ctx.app.contentPacks.questions()`）を渡す。モード ID `pack` は予約 ID で、game-kit がパックの問題があるときだけ表示し、難易度を選ばせず、記録を同梱の問題と分け、ルール説明を「未検査の問題を含む」説明に差し替える（`game-kit/packMode.ts`）。シーンでは `ctx.mode === CONTENT_PACK_MODE` のときにパックの問題だけを出し、復習・苦手の記録には入れない。
- コンボ: `runGame({ combo: true })` にし、成功で `ctx.combo.hit()`、失敗で `ctx.combo.miss()` を呼び、`ctx.combo.view()` の要素を画面に置く。節目（5・10・20、以降 10 ごと）の控えめな演出・効果音（設定オン時のみ）・読み上げと、結果画面の「最大コンボ」（`ctx.combo.resultDetails()` を details の好きな位置に展開。無ければ末尾に自動で足す）は game-kit が行う。スコア倍率は `combo: { rates: DEFAULT_COMBO_RATES }` のように表を渡したゲームだけで働き、`hit()` が返す `multiplier` を得点に掛ける（`applyComboMultiplier`）。既存のゲーム（タイピング・ショートカット早押しクイズ）は自己ベストの公平性のため倍率をかけない（表示のみ）。
- 日替わりチャレンジ: `score.daily: true`（`feature.ts`）と `runGame({ daily: { mode, level } })` にし、お題を作る乱数に `ctx.daily?.random ?? Math.random` を使う（演出には使わない）。ルール説明の「今日のチャレンジ」・1 日 1 回の記録（`daily/submit`。自己ベスト・ゴーストとは別）・結果のコピーは game-kit が行う（`game-kit/dailyPlay.ts`・`docs/08-keep-playing.md`）。
- 実績用の出来事: プレイ回数・ベスト更新は自動で記録される。ゲーム固有の出来事（ノーミス・打ち終えたお題の数など）は `bridge.recordEvent(name, value?, op?)` で送り、実績の判定はゲームに書かない（`content/achievements/`）。
- L6 ではカウントダウン（`.countdown`）が消えるまで待ってから操作する（ゲーム画面はカウントダウン中から表示される）。
- 入力: キーボードのみで遊べること。マウス操作は補助。Esc = 一時停止。
- 効果音は `settings.sound.enabled` が true のときだけ鳴らす（既定オフ）。
- スコアは `score/submit` で送る。保存形式は共通（best / history / playCount）なので独自キーで保存しない。
- 点滅・激しいフラッシュ表現は避ける（光過敏への配慮）。
- `FeatureDefinition` に `playTime` を必ず設定する。

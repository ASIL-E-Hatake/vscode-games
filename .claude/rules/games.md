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
  - 既存のゲームに後からモードを足すときは、従来の遊び方のモードに `legacy: true` を付け、モード導入前の記録（キー `score`）を引き継ぐ（例: `game-reaction` の「通常」）。
- ゴースト対戦: `runGame({ ghost: true })` にし、シーンで経過の値（大きいほど進んでいる値。例: 入力済み文字数）を値が変わるたびに `ctx.ghost.track(value)` で報告し（最初の値も報告する）、`ctx.ghost.view({ target, unit })` が返す要素を画面に置く。時刻の計測・間引き・自己ベスト時の保存・ルール説明の「ゴーストを表示する」は game-kit が行うので、ゲーム側で保存しない。
- L6 ではカウントダウン（`.countdown`）が消えるまで待ってから操作する（ゲーム画面はカウントダウン中から表示される）。
- 入力: キーボードのみで遊べること。マウス操作は補助。Esc = 一時停止。
- 効果音は `settings.sound.enabled` が true のときだけ鳴らす（既定オフ）。
- スコアは `score/submit` で送る。保存形式は共通（best / history / playCount）なので独自キーで保存しない。
- 点滅・激しいフラッシュ表現は避ける（光過敏への配慮）。
- `FeatureDefinition` に `playTime` を必ず設定する。

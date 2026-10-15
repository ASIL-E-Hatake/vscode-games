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
- L3 テストでは `page.clock` で時計を止め（`install` → `pauseAt`）、`runFor` で時間を進める。乱数は `webview.open(..., { random })` で固定する。
- 入力: キーボードのみで遊べること。マウス操作は補助。Esc = 一時停止。
- 効果音は `settings.sound.enabled` が true のときだけ鳴らす（既定オフ）。
- スコアは `score/submit` で送る。保存形式は共通（best / history / playCount）なので独自キーで保存しない。
- 点滅・激しいフラッシュ表現は避ける（光過敏への配慮）。
- `FeatureDefinition` に `playTime` を必ず設定する。

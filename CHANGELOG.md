# Changelog

このプロジェクトの主な変更履歴です。形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、バージョンは [SemVer](https://semver.org/lang/ja/) に従います。

## [Unreleased]

### Added
- ホーム画面: 今日のひとこと（Tips）、最近使った機能、自己ベスト、機能一覧
- 機能ごとの保存領域・スコア記録（自己ベスト・履歴・プレイ回数）・最近使った機能の記録
- 拡張機能の雛形（アクティビティバーのアイコン、メニュー、ホーム画面の仮表示）
- テスト基盤（L1〜L6）とスクリーンショット付きテストレポート

### Fixed
- 保存が立て続けに起きると globalState の値が消えることがある問題への対策（ConsistentStore）

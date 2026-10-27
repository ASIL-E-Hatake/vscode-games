// リリースの署名を確かめる公開鍵（Ed25519。SPKI DER を base64 にしたもの）。
// 秘密鍵は GitHub の Environment `release` の secret `RELEASE_SIGNING_KEY` にあり、release.yml が
// SHA256SUMS のバイト列に署名して SHA256SUMS.sig（base64 1 行）を Release に添付する。
// 鍵を変えるときは、新しい鍵で署名した版を出す前に、この値を変えた版を配っておく（古い版は新しい鍵の署名を確かめられない）。
// 正しい Ed25519 の公開鍵として読めることは L1（releaseKey.test.ts）と L5（scripts/test-package.ts）で検査する。
export const RELEASE_PUBLIC_KEY = 'MCowBQYDK2VwAyEA578NrSxq/9LD/Fo+e6eLMdz8dpUOwhBAXC4FclgYZS0=';

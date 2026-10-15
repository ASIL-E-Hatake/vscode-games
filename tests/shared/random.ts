// テスト用のシード付き乱数（mulberry32）。同じシードなら同じ数列を返す。
// L3 のハーネスで Webview の Math.random を置き換えるため、外部の変数を参照しない 1 つの関数にしておく。
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

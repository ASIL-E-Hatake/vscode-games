import { ok, type ConvertResult } from './types';

// 全角カタカナ（濁点・半濁点の付かないもの）と、対応する半角カタカナ。同じ長さで同じ順
const FULL =
  'ァアィイゥウェエォオカキクケコサシスセソタチッツテトナニヌネノハヒフヘホマミムメモャヤュユョヨラリルレロワヲンー。「」、・';
const HALF = 'ｧｱｨｲｩｳｪｴｫｵｶｷｸｹｺｻｼｽｾｿﾀﾁｯﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓｬﾔｭﾕｮﾖﾗﾘﾙﾚﾛﾜｦﾝｰ｡｢｣､･';
export const KATAKANA_TABLE = { full: FULL, half: HALF };

const toHalfKana = new Map([...FULL].map((c, i) => [c, HALF[i] ?? c]));
const toFullKana = new Map([...FULL].map((c, i) => [HALF[i] ?? c, c]));
const DAKUTEN = '\u3099';
const HANDAKUTEN = '\u309a';

/** 全角 → 半角（英数字・記号・空白・カタカナ。ガ → ｶﾞ のように濁点は 2 文字になる） */
export function toHalfWidth(input: string): ConvertResult {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0xff01 && code <= 0xff5e) out += String.fromCharCode(code - 0xfee0);
    else if (code === 0x3000) out += ' ';
    else if (toHalfKana.has(ch)) out += toHalfKana.get(ch);
    else {
      // 濁点・半濁点付き（ガ・パ・ヴ）は NFD で「清音 + 結合文字」に分けて変換する
      const [base, mark] = ch.normalize('NFD');
      const half = base ? toHalfKana.get(base) : undefined;
      if (half && mark === DAKUTEN) out += `${half}ﾞ`;
      else if (half && mark === HANDAKUTEN) out += `${half}ﾟ`;
      else out += ch;
    }
  }
  return ok(out);
}

/** 半角 → 全角（英数字・記号・空白・カタカナ。ｶﾞ → ガ のように濁点は前の文字と合わせる） */
export function toFullWidth(input: string): ConvertResult {
  const chars = [...input];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] ?? '';
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x21 && code <= 0x7e) out += String.fromCharCode(code + 0xfee0);
    else if (code === 0x20) out += '　';
    else if (toFullKana.has(ch)) {
      const full = toFullKana.get(ch) ?? ch;
      const next = chars[i + 1];
      const mark = next === 'ﾞ' ? DAKUTEN : next === 'ﾟ' ? HANDAKUTEN : undefined;
      const combined = mark ? (full + mark).normalize('NFC') : undefined;
      // 合成できたとき（ｶ + ﾞ → ガ）だけ濁点を消費する。ｱﾞ のように合成できない濁点はそのまま残す
      if (combined && [...combined].length === 1) {
        out += combined;
        i++;
      } else out += full;
    } else out += ch;
  }
  return ok(out);
}

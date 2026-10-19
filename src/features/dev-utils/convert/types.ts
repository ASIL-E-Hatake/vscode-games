/** 変換の結果。失敗のときは利用者に見せるエラーメッセージを返す（例外は投げない） */
export type ConvertResult = { ok: true; output: string } | { ok: false; error: string };

export const ok = (output: string): ConvertResult => ({ ok: true, output });
export const fail = (error: string): ConvertResult => ({ ok: false, error });

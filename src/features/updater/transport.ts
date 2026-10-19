// アップデート確認の通信（Node の https モジュール）。
// 拡張ホストでは VS Code がプロキシ設定（http.proxy 等）を https モジュールに適用するため、fetch ではなくこちらを使う。
// この拡張機能で外部と通信するのはここだけ（CLAUDE.md ルール 1 の例外。ESLint で他のファイルからの import を禁止）。
import * as http from 'node:http';
import * as https from 'node:https';
import {
  isAllowedUpdateUrl,
  REQUEST_IDLE_TIMEOUT_MS,
  REQUEST_TOTAL_TIMEOUT_MS,
  UpdateError,
  type HostPolicy,
} from './logic';

export interface HttpResponse {
  status: number;
  /** リダイレクトのときの Location（そのままの値） */
  location?: string;
  body: Buffer;
}

export interface GetOptions {
  /** 受け取るサイズの上限（超えたら失敗） */
  maxBytes: number;
  /** 本文を読まない（リダイレクト先だけ知りたいとき） */
  skipBody?: boolean;
}

/** 1 回の GET（リダイレクトは自動で追わない）。テストでは差し替える */
export type HttpGet = (url: string, options: GetOptions) => Promise<HttpResponse>;

/** Node の http / https で GET する。許可したホスト以外には接続しない */
export function createHttpGet(policy: HostPolicy = {}, userAgent = 'hatake-gottani'): HttpGet {
  return (url, { maxBytes, skipBody }) =>
    new Promise<HttpResponse>((resolve, reject) => {
      if (!isAllowedUpdateUrl(url, policy)) {
        reject(new UpdateError(`許可されていない接続先です: ${url}`));
        return;
      }
      const client = url.startsWith('http:') ? http : https;
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(totalTimer);
        fn();
      };
      const req = client.get(
        url,
        { headers: { 'User-Agent': userAgent, Accept: '*/*' } },
        (res) => {
          const status = res.statusCode ?? 0;
          const location = res.headers.location;
          if (skipBody || (status >= 300 && status < 400)) {
            res.resume();
            finish(() =>
              resolve({ status, ...(location ? { location } : {}), body: Buffer.alloc(0) }),
            );
            req.destroy();
            return;
          }
          const length = Number(res.headers['content-length']);
          if (Number.isFinite(length) && length > maxBytes) {
            req.destroy();
            finish(() => reject(new UpdateError('ファイルが大きすぎます')));
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > maxBytes) {
              req.destroy();
              finish(() => reject(new UpdateError('ファイルが大きすぎます')));
              return;
            }
            chunks.push(chunk);
          });
          res.on('end', () => finish(() => resolve({ status, body: Buffer.concat(chunks) })));
          res.on('error', (err) => finish(() => reject(err)));
        },
      );
      // 応答が止まったとき（REQUEST_IDLE_TIMEOUT_MS）と、全体の上限
      req.setTimeout(REQUEST_IDLE_TIMEOUT_MS, () => {
        req.destroy();
        finish(() => reject(new UpdateError('応答がありません（タイムアウト）')));
      });
      // finish は通信の応答（非同期）からだけ呼ばれるため、ここで作ったタイマーを参照できる
      const totalTimer = setTimeout(() => {
        req.destroy();
        finish(() => reject(new UpdateError('時間がかかりすぎたため中止しました')));
      }, REQUEST_TOTAL_TIMEOUT_MS);
      req.on('error', (err) => finish(() => reject(err)));
    });
}

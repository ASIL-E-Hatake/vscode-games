// transport.ts をローカルの HTTP サーバー（127.0.0.1）で確かめる（外部には通信しない）
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHttpGet } from './transport';

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: '/releases/tag/v1.2.3' });
      res.end('moved');
    } else if (req.url === '/big') {
      res.writeHead(200);
      res.end(Buffer.alloc(2048));
    } else if (req.url === '/ua') {
      res.writeHead(200);
      res.end(req.headers['user-agent']);
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('createHttpGet', () => {
  const get = createHttpGet({ allowLoopback: true }, 'hatake-gottani/test');

  it('リダイレクトは追わずに Location を返す', async () => {
    const res = await get(`${base}/redirect`, { maxBytes: 100 });
    expect(res).toMatchObject({ status: 302, location: '/releases/tag/v1.2.3' });
    expect(res.body.length).toBe(0);
  });

  it('本文と User-Agent', async () => {
    const res = await get(`${base}/ua`, { maxBytes: 100 });
    expect(res.status).toBe(200);
    expect(res.body.toString()).toBe('hatake-gottani/test');
    expect((await get(`${base}/missing`, { maxBytes: 100 })).status).toBe(404);
  });

  it('サイズの上限を超えたら失敗', async () => {
    await expect(get(`${base}/big`, { maxBytes: 1024 })).rejects.toThrow('大きすぎます');
    expect((await get(`${base}/big`, { maxBytes: 4096 })).body.length).toBe(2048);
  });

  it('許可していない接続先には接続しない（テスト用の 127.0.0.1 も既定では不可）', async () => {
    await expect(createHttpGet()(`${base}/ua`, { maxBytes: 100 })).rejects.toThrow(
      '許可されていない',
    );
    await expect(get('https://example.com/', { maxBytes: 100 })).rejects.toThrow(
      '許可されていない',
    );
  });
});

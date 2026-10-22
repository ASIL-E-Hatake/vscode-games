// L2（コンテナ）の検査専用の最小の Node アプリ。scripts/container-e2e.ts が使う。vsix には入らない。
// GET /health で DATABASE_URL（PostgreSQL）に繋ぎ、SELECT 1 が通れば {"status":"UP"} を返す
import http from 'node:http';
import pg from 'pg';

const { Client } = pg;

const port = Number(process.env.PORT ?? 3000);

http
  .createServer(async (req, res) => {
    if (req.url !== '/health') {
      res.writeHead(404).end();
      return;
    }
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    try {
      await client.connect();
      await client.query('SELECT 1');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'UP' }));
    } catch (error) {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'DOWN', error: String(error) }));
    } finally {
      await client.end().catch(() => {});
    }
  })
  .listen(port, () => console.log(`listening on ${port}`));

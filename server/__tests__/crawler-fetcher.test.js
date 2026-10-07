import http from 'http';
import { createFetcher } from '../../scripts/crawler/fetcher.js';

describe('crawler fetcher', () => {
  let server;
  let baseUrl;
  let hits;

  beforeAll(async () => {
    hits = [];
    server = http.createServer((req, res) => {
      hits.push({ url: req.url, ua: req.headers['user-agent'] });
      if (req.url === '/ok.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ hello: 'world' }));
        return;
      }
      if (req.url === '/flaky') {
        const count = hits.filter((h) => h.url === '/flaky').length;
        if (count < 3) {
          res.writeHead(500);
          res.end('boom');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.url === '/missing') {
        res.writeHead(404);
        res.end('nope');
        return;
      }
      if (req.url === '/text') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('纯文本');
        return;
      }
      res.writeHead(200);
      res.end('');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  beforeEach(() => {
    hits = [];
  });

  test('getJson sends browser UA and parses json', async () => {
    const fetcher = createFetcher({ proxy: null });
    const data = await fetcher.getJson(`${baseUrl}/ok.json`);
    expect(data).toEqual({ hello: 'world' });
    expect(hits[0].ua).toContain('Mozilla/5.0');
  });

  test('retries on 500 and eventually succeeds', async () => {
    const fetcher = createFetcher({ proxy: null, retries: 3, backoffMs: 10 });
    const data = await fetcher.getJson(`${baseUrl}/flaky`);
    expect(data).toEqual({ ok: true });
    expect(hits.filter((h) => h.url === '/flaky')).toHaveLength(3);
  });

  test('does not retry 404 and throws with status', async () => {
    const fetcher = createFetcher({ proxy: null, retries: 2, backoffMs: 10 });
    await expect(fetcher.getText(`${baseUrl}/missing`)).rejects.toThrow('HTTP 404');
    expect(hits.filter((h) => h.url === '/missing')).toHaveLength(1);
  });

  test('rate limit spaces requests to same host', async () => {
    const fetcher = createFetcher({ proxy: null, rateLimitMs: 150 });
    const start = Date.now();
    await fetcher.getText(`${baseUrl}/text`);
    await fetcher.getText(`${baseUrl}/text`);
    expect(Date.now() - start).toBeGreaterThanOrEqual(145);
    expect(hits).toHaveLength(2);
  });

  test('getText returns body string', async () => {
    const fetcher = createFetcher({ proxy: null });
    const text = await fetcher.getText(`${baseUrl}/text`);
    expect(text).toBe('纯文本');
  });
});

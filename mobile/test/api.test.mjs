import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ApiError, DEFAULT_SERVER_URL, buildImageUrl, createApiClient, normalizeServerUrl,
} from '../src/api/client.js';

const jsonResponse = (body, { ok = true, status = 200 } = {}) => ({
  ok, status, async json() { return body; },
});

test('normalizeServerUrl：补协议、去尾斜杠、丢 query', () => {
  assert.equal(normalizeServerUrl('1.2.3.4:8443'), 'https://1.2.3.4:8443');
  assert.equal(normalizeServerUrl('https://1.2.3.4:8443///'), 'https://1.2.3.4:8443');
  assert.equal(normalizeServerUrl('http://example.com/x?y=1#z'), 'http://example.com/x');
  assert.equal(normalizeServerUrl('   '), DEFAULT_SERVER_URL);
  assert.equal(normalizeServerUrl('', 'https://fallback:1'), 'https://fallback:1');
});

test('buildImageUrl：相对路径补成绝对地址，绝对地址原样返回', () => {
  assert.equal(buildImageUrl('https://1.2.3.4:8443', '/img/t/a.webp'), 'https://1.2.3.4:8443/img/t/a.webp');
  assert.equal(buildImageUrl('https://1.2.3.4:8443', 'img/t/a.webp'), 'https://1.2.3.4:8443/img/t/a.webp');
  assert.equal(buildImageUrl('https://1.2.3.4:8443', 'https://cdn/x.webp'), 'https://cdn/x.webp');
  assert.equal(buildImageUrl('https://1.2.3.4:8443', null), null);
});

test('createApiClient：请求路径与查询参数正确', async () => {
  const seen = [];
  const client = createApiClient({
    serverUrl: 'https://host:8443',
    fetchImpl: async (url) => { seen.push(url); return jsonResponse({ ok: 1 }); },
  });
  await client.getIndex();
  await client.getEntry('zzz/agents/1011');
  await client.listEntries({ category: 'hsr/characters', q: '三月 七', page: 2, limit: 30 });
  assert.equal(seen[0], 'https://host:8443/api/catalog/index');
  assert.equal(seen[1], 'https://host:8443/api/catalog/entry?key=zzz%2Fagents%2F1011');
  assert.equal(seen[2], 'https://host:8443/api/catalog/entries?category=hsr%2Fcharacters&q=%E4%B8%89%E6%9C%88+%E4%B8%83&page=2&limit=30');
});

test('createApiClient：非 2xx 抛 ApiError 并带上状态码', async () => {
  const client = createApiClient({
    serverUrl: 'https://host:8443',
    fetchImpl: async () => jsonResponse({}, { ok: false, status: 403 }),
  });
  await assert.rejects(client.getIndex(), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 403);
    assert.match(error.message, /403/);
    return true;
  });
});

test('createApiClient：网络异常与超时都收敛成 ApiError', async () => {
  const failing = createApiClient({ serverUrl: 'https://host:8443', fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
  await assert.rejects(failing.getIndex(), (error) => error instanceof ApiError && /ECONNREFUSED/.test(error.message));

  const hanging = createApiClient({
    serverUrl: 'https://host:8443',
    timeoutMs: 20,
    fetchImpl: (url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('This operation was aborted')));
    }),
  });
  await assert.rejects(hanging.getIndex(), (error) => error instanceof ApiError && /aborted/i.test(error.message));
});

test('createApiClient：返回非 JSON 时报错而不是静默', async () => {
  const client = createApiClient({
    serverUrl: 'https://host:8443',
    fetchImpl: async () => ({ ok: true, status: 200, async json() { throw new Error('bad json'); } }),
  });
  await assert.rejects(client.getIndex(), (error) => error instanceof ApiError && /JSON/.test(error.message));
});

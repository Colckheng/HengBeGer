/**
 * 对真实预演栈（本机 Docker，8444 端口自签证书）跑一遍 App 客户端的完整链路。
 * 栈没起来就跳过，不算失败。
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiClient, normalizeServerUrl } from '../src/api/client.js';
import { describeFields } from '../src/lib/fields.js';

const serverUrl = normalizeServerUrl(process.env.HENGBERGER_TEST_SERVER || 'https://127.0.0.1:8444');

test('live：索引 / 分类 / 条目 / 图片 / 封禁路径', async (t) => {
  const client = createApiClient({ serverUrl, timeoutMs: 15000 });
  let index;
  try {
    index = await client.getIndex();
  } catch (error) {
    t.skip('预演栈未运行，跳过：' + error.message);
    return;
  }

  assert.ok(index.items.length > 2500, '索引条目数异常：' + index.items.length);
  assert.equal(index.groups.length, 23);
  assert.ok(index.generatedAt);

  const categories = await client.getCategories();
  assert.equal(categories.length, 23);
  assert.ok(categories.every((group) => group.id && typeof group.count === 'number'));

  const key = index.items[0].key;
  const entry = await client.getEntry(key);
  assert.equal(entry.key, key);
  assert.ok(entry.name);
  assert.ok(Array.isArray(entry.sections) && entry.sections.length > 0, '条目应有章节');
  assert.ok(describeFields(entry).length > 0, '条目应有可展示的元数据行');
  const imageUrl = client.imageUrl(entry.image);
  assert.ok(imageUrl.startsWith(serverUrl + '/img/'), '图片地址不对：' + imageUrl);

  const image = await fetch(imageUrl);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/webp');
  assert.match(image.headers.get('cache-control') || '', /immutable/);

  for (const blocked of ['/api/data', '/api/auth/session', '/metrics']) {
    const response = await fetch(serverUrl + blocked);
    assert.equal(response.status, 403, blocked + ' 应该是 403');
  }

  const health = await fetch(serverUrl + '/health/live');
  assert.equal(health.status, 200);
});

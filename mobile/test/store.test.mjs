import assert from 'node:assert/strict';
import test from 'node:test';
import { createCache, entryCacheKey } from '../src/store/cache.js';
import { createLibrary } from '../src/store/library.js';
import { createMemoryStorage } from './memory-storage.mjs';

test('cache：没有缓存时返回 stale 且 data 为 null', async () => {
  const cache = createCache({ storage: createMemoryStorage(), now: () => 1000 });
  const result = await cache.readIndex();
  assert.equal(result.data, null);
  assert.equal(result.stale, true);
});

test('cache：写入后能读回，TTL 过期标记 stale', async () => {
  const storage = createMemoryStorage();
  let clock = 10_000;
  const cache = createCache({ storage, now: () => clock, ttlMs: 1000 });
  await cache.writeIndex({ items: [{ key: 'a' }] });
  const fresh = await cache.readIndex();
  assert.equal(fresh.data.items.length, 1);
  assert.equal(fresh.stale, false);
  clock += 1001;
  assert.equal((await cache.readIndex()).stale, true);
});

test('cache：损坏的 JSON 当成没有缓存，不抛异常', async () => {
  const storage = createMemoryStorage({ [entryCacheKey('x')]: '{oops' });
  const cache = createCache({ storage });
  assert.equal(await cache.readEntry('x'), null);
});

test('cache：条目按 key 分开存，clear 只删自己的键', async () => {
  const storage = createMemoryStorage({ 'hb:serverUrl': 'https://keep' });
  const cache = createCache({ storage });
  await cache.writeEntry('a', { name: 'A' });
  await cache.writeEntry('b', { name: 'B' });
  assert.equal((await cache.readEntry('a')).data.name, 'A');
  assert.deepEqual((await cache.listCachedEntries()).sort(), ['a', 'b']);
  assert.equal(await cache.clear(), 2);
  assert.equal(await storage.getItem('hb:serverUrl'), 'https://keep');
  assert.equal(await storage.getItem(entryCacheKey('a')), null);
});

test('library：收藏可切换、可查询', async () => {
  const library = createLibrary({ storage: createMemoryStorage(), now: () => 5 });
  assert.equal(await library.isFavorite('k1'), false);
  const added = await library.toggleFavorite('k1', '名字');
  assert.equal(added.active, true);
  assert.equal(await library.isFavorite('k1'), true);
  const removed = await library.toggleFavorite('k1');
  assert.equal(removed.active, false);
  assert.equal(await library.isFavorite('k1'), false);
});

test('library：历史去重、最新的在最前、超过上限被截断', async () => {
  const library = createLibrary({ storage: createMemoryStorage(), now: () => 1, historyMax: 3 });
  await library.pushHistory('a');
  await library.pushHistory('b');
  await library.pushHistory('a');
  assert.deepEqual((await library.listHistory()).map((item) => item.key), ['a', 'b']);
  await library.pushHistory('c');
  await library.pushHistory('d');
  assert.deepEqual((await library.listHistory()).map((item) => item.key), ['d', 'c', 'a']);
  await library.clearHistory();
  assert.deepEqual(await library.listHistory(), []);
});

test('library：removeHistory 只删指定 key，其余顺序不变', async () => {
  const library = createLibrary({ storage: createMemoryStorage(), now: () => 1 });
  await library.pushHistory('a', 'A');
  await library.pushHistory('b', 'B');
  await library.pushHistory('c', 'C');
  await library.removeHistory('b');
  assert.deepEqual((await library.listHistory()).map((item) => item.key), ['c', 'a']);
  // 不存在的 key 不报错、不改变列表
  await library.removeHistory('nope');
  assert.deepEqual((await library.listHistory()).map((item) => item.key), ['c', 'a']);
});

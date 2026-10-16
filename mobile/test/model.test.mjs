import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHomeModel, totalCount, worldOf, WORLDS } from '../src/lib/home.js';
import { categoriesOf, filterItems } from '../src/lib/list.js';
import { describeFields } from '../src/lib/fields.js';

const index = {
  generatedAt: '2026-10-14T00:00:00.000Z',
  groups: [
    { id: 'zzz/agents', name: '绝区零 · 代理人', count: 2, total: 2 },
    { id: 'hsr/characters', name: '星铁 · 角色', count: 1, total: 1 },
    { id: 'currency/season1/roles', name: '货币战争 S1 · 角色', count: 1, total: 1 },
  ],
  items: [
    { key: 'zzz/agents/1', category: 'zzz/agents', name: '安比', image: '/img/t/a.webp', updatedAt: '2026-10-01' },
    { key: 'zzz/agents/2', category: 'zzz/agents', name: '妮可', image: '/img/t/b.webp', updatedAt: '2026-10-09' },
    { key: 'hsr/characters/1', category: 'hsr/characters', name: '三月七', image: '/img/t/c.webp' },
    { key: 'currency/season1/roles/1', category: 'currency/season1/roles', name: '爻光', image: '/img/t/d.webp' },
  ],
};

test('worldOf：按 key 前缀识别世界', () => {
  assert.equal(worldOf('zzz/agents/1').id, 'zzz');
  assert.equal(worldOf('currency/season2/items/9').id, 'currency');
  assert.equal(worldOf('nope/x'), null);
});

test('buildHomeModel：三个世界各自计数、常用分类带数量、最近更新按 updatedAt 倒序', () => {
  const home = buildHomeModel(index, { recentLimit: 3 });
  assert.equal(home.length, WORLDS.length);
  const zzz = home.find((world) => world.id === 'zzz');
  assert.equal(zzz.total, 2);
  assert.deepEqual(zzz.quick.map((group) => group.id), ['zzz/agents']);
  assert.equal(zzz.quick[0].count, 2);
  assert.deepEqual(zzz.recent.map((entry) => entry.name), ['妮可', '安比']);
  assert.equal(home.find((world) => world.id === 'hsr').total, 1);
  assert.equal(home.find((world) => world.id === 'hsr').recent[0].name, '三月七');
});

test('buildHomeModel：空索引不炸', () => {
  const home = buildHomeModel(null);
  assert.equal(home.length, WORLDS.length);
  assert.equal(home[0].total, 0);
  assert.deepEqual(home[0].recent, []);
  assert.equal(totalCount(null), 0);
});

test('filterItems：分类前缀、搜索、分页', () => {
  const all = filterItems(index.items);
  assert.equal(all.total, 4);
  assert.equal(filterItems(index.items, { category: 'zzz' }).total, 2);
  assert.equal(filterItems(index.items, { category: 'zzz/agents' }).total, 2);
  assert.equal(filterItems(index.items, { category: 'zzz/other' }).total, 0);
  assert.equal(filterItems(index.items, { q: '三月' }).items[0].name, '三月七');
  assert.equal(filterItems(index.items, { q: 'ZZZ/AGENTS/1' }).total, 1);
  const paged = filterItems(index.items, { limit: 3, page: 2 });
  assert.equal(paged.page, 2);
  assert.equal(paged.pageCount, 2);
  assert.equal(paged.items.length, 1);
  assert.equal(filterItems(index.items, { limit: 3, page: 99 }).page, 2);
  assert.equal(filterItems(index.items, { limit: 0 }).pageSize, 30);
});

test('describeFields：摊平元数据、隐藏内部字段、跳过对象与空值', () => {
  const rows = describeFields({
    fields: [{
      id: '1415', game: 'hsr', name: '昔涟', tags: ['hsr'], type: 'character',
      命途: '记忆', 属性: '冰', 星级: 5, version: '27', source_url: 'https://x',
      nothing: null, empty: '', nested: { a: 1 },
    }],
  });
  assert.deepEqual(rows, [
    { label: '命途', value: '记忆' },
    { label: '属性', value: '冰' },
    { label: '星级', value: '5' },
    { label: '版本', value: '27' },
  ]);
  assert.deepEqual(describeFields(null), []);
  assert.deepEqual(describeFields({ fields: 'nope' }), []);

  // 接口对 fields 也可能是单个对象（货币战争条目就是这种形状）
  const asObject = describeFields({ fields: { id: 1001, name: '追击概念股', 关联: '1、1220', 赛季: 'S1', version: '4.6.51' } });
  assert.deepEqual(asObject, [
    { label: '关联', value: '1、1220' },
    { label: '赛季', value: 'S1' },
    { label: '版本', value: '4.6.51' },
  ]);

  // 采集链路的元信息不出现在属性表里（它们的值常是很长的 URL / 时间戳）
  const crawler = describeFields({
    fields: {
      id: 1201, name: '欢愉契约', last_crawled_at: '2026-10-07T10:52:07.905Z',
      image_source_url: 'https://static.nanoka.cc/assets/hsr/gridfight/portal/1201.webp',
      image_match: 'snapshot-season-category-unique-name', 赛季: 'S1',
    },
  });
  assert.deepEqual(crawler, [{ label: '赛季', value: 'S1' }]);
});

test('categoriesOf：可按世界过滤', () => {
  assert.equal(categoriesOf(index).length, 3);
  assert.deepEqual(categoriesOf(index, 'currency').map((group) => group.id), ['currency/season1/roles']);
});

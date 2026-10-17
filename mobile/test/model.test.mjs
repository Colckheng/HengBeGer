import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHomeModel, pickRecent, recencyOf, totalCount, worldOf, WORLDS } from '../src/lib/home.js';
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

test('recencyOf：读 updatedAt，缺失时退到 fields.last_crawled_at', () => {
  assert.equal(recencyOf({ updatedAt: '2026-10-09T00:00:00.000Z' }), Date.parse('2026-10-09T00:00:00.000Z'));
  assert.equal(recencyOf({ fields: { last_crawled_at: '2026-10-08T07:58:42.198Z' } }), Date.parse('2026-10-08T07:58:42.198Z'));
  assert.equal(recencyOf({}), 0);
  assert.equal(recencyOf(null), 0);
  assert.equal(recencyOf({ fields: { last_crawled_at: 'not-a-date' } }), 0);
});

test('buildHomeModel：最近更新只挑有封面的条目，灰块不会上首页', () => {
  const mixed = {
    generatedAt: '2026-10-14T00:00:00.000Z',
    groups: [],
    items: [
      // 无封面（hsr/gacha 全库 65 张都这样），且时间最新
      { key: 'hsr/gacha/1', category: 'hsr/gacha', name: '常驻跃迁', image: null, updatedAt: '2026-10-14' },
      { key: 'hsr/gacha/2', category: 'hsr/gacha', name: '始发跃迁', image: '', updatedAt: '2026-10-13' },
      { key: 'hsr/characters/1', category: 'hsr/characters', name: '三月七', image: '/img/t/c.webp', updatedAt: '2026-10-12' },
      { key: 'hsr/light_cones/1', category: 'hsr/light_cones', name: '锋镝', image: '/img/t/e.webp', updatedAt: '2026-10-11' },
      { key: 'hsr/relics/1', category: 'hsr/relics', name: '太空封印站', image: '/img/t/f.webp', updatedAt: '2026-10-10' },
      { key: 'hsr/enemies/1', category: 'hsr/enemies', name: '冰锋', image: '/img/t/g.webp', updatedAt: '2026-10-09' },
      { key: 'hsr/relics/2', category: 'hsr/relics', name: '梦想之地', image: '/img/t/h.webp', updatedAt: '2026-10-08' },
    ],
  };
  const hsr = buildHomeModel(mixed, { recentLimit: 4 }).find((world) => world.id === 'hsr');
  // 两条无封面的跃迁时间最新，但一个都不该出现在六格里
  assert.deepEqual(hsr.recent.map((entry) => entry.key), [
    'hsr/characters/1',
    'hsr/light_cones/1',
    'hsr/relics/1',
    'hsr/enemies/1',
  ]);
  assert.ok(hsr.recent.every((entry) => entry.image), '最近更新里出现了无封面的条目');
  // 但总数统计不受影响（无封面条目也是资料）
  assert.equal(hsr.total, 7);
});

test('buildHomeModel：整个世界的条目都没封面时回退，六格不留空', () => {
  const allNoCover = {
    generatedAt: '2026-10-14T00:00:00.000Z',
    groups: [],
    items: [
      { key: 'hsr/formula/1', category: 'hsr/formula', name: '公式一', image: null, updatedAt: '2026-10-14' },
      { key: 'hsr/formula/2', category: 'hsr/formula', name: '公式二', image: null, updatedAt: '2026-10-13' },
    ],
  };
  const hsr = buildHomeModel(allNoCover, { recentLimit: 6 }).find((world) => world.id === 'hsr');
  assert.deepEqual(hsr.recent.map((entry) => entry.key), ['hsr/formula/1', 'hsr/formula/2']);
});

test('pickRecent：按分类轮转，不把六格缩略图塞满同一个分类', () => {
  const items = [
    { key: 'a/1', category: 'zzz/bangboo' },
    { key: 'a/2', category: 'zzz/bangboo' },
    { key: 'a/3', category: 'zzz/bangboo' },
    { key: 'b/1', category: 'zzz/agents' },
    { key: 'c/1', category: 'zzz/sound_engines' },
  ];
  assert.deepEqual(pickRecent(items, 3).map((item) => item.key), ['a/1', 'b/1', 'c/1']);
  // 分类不够时按轮次补，仍然不重复
  assert.deepEqual(pickRecent(items, 5).map((item) => item.key), ['a/1', 'b/1', 'c/1', 'a/2', 'a/3']);
  assert.deepEqual(pickRecent([], 6), []);
});

test('buildHomeModel：最近更新按时间倒序并跨分类轮转（索引没有 updatedAt 时用 fields）', () => {
  const withFields = {
    groups: [{ id: 'zzz/agents', name: '绝区零 · 代理人', count: 1, total: 1 }],
    items: [
      { key: 'zzz/bangboo/1', category: 'zzz/bangboo', name: '恶魔布', fields: { last_crawled_at: '2026-10-07T14:32:05.854Z' } },
      { key: 'zzz/bangboo/2', category: 'zzz/bangboo', name: '泪眼布', fields: { last_crawled_at: '2026-10-07T14:32:05.288Z' } },
      { key: 'zzz/agents/1011', category: 'zzz/agents', name: '安比', fields: { last_crawled_at: '2026-10-07T14:00:00.000Z' } },
    ],
  };
  const zzz = buildHomeModel(withFields, { recentLimit: 2 }).find((world) => world.id === 'zzz');
  assert.deepEqual(zzz.recent.map((entry) => entry.name), ['恶魔布', '安比']);
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
  // version '27' 是 hsr 的内容版本序号（不是读者要的版本号），按内部编号跳过。
  assert.deepEqual(rows, [
    { label: '命途', value: '记忆' },
    { label: '属性', value: '冰' },
    { label: '星级', value: '5' },
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
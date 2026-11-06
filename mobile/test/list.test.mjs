import assert from 'node:assert/strict';
import test from 'node:test';
import { applyFacets, categoriesGroupedByWorld, categoriesInScope, categoryChipLabel, facetValues, filterFieldsFor, filterItems, scopeCategory } from '../src/lib/list.js';
import * as list from '../src/lib/list.js';

test('categoriesGroupedByWorld 按世界分组并保持既有顺序', () => {
  const categories = [
    { id: 'currency/season1/roles', name: '货币战争 S1 · 角色', count: 4 },
    { id: 'zzz/agents', name: '绝区零 · 代理人', count: 4 },
    { id: 'hsr/characters', name: '星铁 · 角色', count: 4 },
  ];
  const groups = categoriesGroupedByWorld(categories);
  assert.deepEqual(groups.map(group => group.id), ['zzz', 'hsr', 'currency']);
  assert.deepEqual(groups[0].categories, [{ id: 'zzz/agents', name: '绝区零 · 代理人', count: 4 }]);
});

test('categoriesGroupedByWorld 包含未知世界的分组', () => {
  const groups = categoriesGroupedByWorld([
    { id: 'other/items', name: '其他 · 物品', count: 2 },
  ]);
  assert.deepEqual(groups.map(group => group.id), ['other']);
  assert.equal(groups[0].title, 'other');
});

test('categoriesGroupedByWorld 空输入返回空数组', () => {
  assert.deepEqual(categoriesGroupedByWorld([]), []);
  assert.deepEqual(categoriesGroupedByWorld(undefined), []);
});

test('filterItems 选中分类时包含子分类', () => {
  const items = [
    { key: 'a', category: 'currency/season1/roles' },
    { key: 'b', category: 'currency/season2/roles' },
    { key: 'c', category: 'zzz/agents' },
  ];
  const view = filterItems(items, { category: 'currency/season1/roles' });
  assert.deepEqual(view.items.map(item => item.key), ['a']);
});

test('filterFieldsFor 给出各分类的二级筛选字段', () => {
  assert.deepEqual(filterFieldsFor('hsr/characters'), ['属性', '命途', '星级', '阵营']);
  assert.deepEqual(filterFieldsFor('zzz/agents'), ['属性', '特性', '攻击方式', '阵营', '评级', '星级']);
  assert.deepEqual(filterFieldsFor('zzz/sound_engines'), ['特性', '稀有度', '星级']);
  assert.deepEqual(filterFieldsFor('zzz/bangboo'), ['稀有度', '星级']);
  assert.deepEqual(filterFieldsFor('currency/season1/roles'), ['站位', '特性', '星阶']);
  assert.deepEqual(filterFieldsFor('currency/season1/traits'), ['成员数']);
  assert.deepEqual(filterFieldsFor('hsr/relics'), ['类型']);
  assert.deepEqual(filterFieldsFor('zzz/未知分类'), []);
  assert.deepEqual(filterFieldsFor(''), []);
});

test('筛选支持同字段多选，并可逐项取消', () => {
  let facets = list.toggleFacet({}, '属性', '冰');
  facets = list.toggleFacet(facets, '属性', '火');
  assert.deepEqual(facets, { 属性: ['冰', '火'] });
  assert.deepEqual(list.toggleFacet(facets, '属性', '冰'), { 属性: ['火'] });
  const items = [{ fields: { 属性: '冰' } }, { fields: { 属性: '火' } }, { fields: {} }];
  assert.equal(applyFacets(items, facets).length, 2);
  assert.equal(applyFacets(items, { 属性: ['冰', '__missing__'] }).length, 2);
});

test('世界和分类切换清除旧条件，赛季切换保留同类且仅保留有效值', () => {
  const items = [
    { category: 'currency/season2/roles', fields: { 站位: '前排', 特性: '新' } },
    { category: 'currency/season2/roles', fields: {} },
  ];
  const facets = { 站位: ['前排', '后排'], 特性: ['旧'], 星阶: ['__missing__'] };
  assert.deepEqual(list.changeScope('zzz', facets), { category: 'zzz', facets: {} });
  assert.deepEqual(list.changeScope('', facets), { category: '', facets: {} });
  assert.deepEqual(list.changeSeason('currency/season1/roles', 'season2', facets, items), {
    category: 'currency/season2/roles', facets: { 站位: ['前排'], 星阶: ['__missing__'] },
  });
  assert.deepEqual(list.changeSeason('currency/season1', 'season2', facets, items), {
    category: 'currency/season2', facets: {},
  });
});

test('facetValues 收集分类内的字段值并标记缺失', () => {
  const items = [
    { category: 'hsr/characters', fields: { 属性: '冰' } },
    { category: 'hsr/characters', fields: { 属性: '物理 / 量子' } },
    { category: 'hsr/characters', fields: {} },
    { category: 'zzz/agents', fields: { 属性: '火' } },
  ];
  const facet = facetValues(items, 'hsr/characters', '属性');
  assert.deepEqual(facet.values, ['冰', '物理', '量子']);
  assert.equal(facet.missing, true);
  assert.deepEqual(facetValues(items, '', '属性').values, ['冰', '物理', '量子', '火']);
});

test('applyFacets 按字段值过滤并支持"未提供"', () => {
  const items = [
    { key: 'a', fields: { 属性: '冰' } },
    { key: 'b', fields: { 属性: '物理 / 量子' } },
    { key: 'c', fields: {} },
  ];
  assert.deepEqual(applyFacets(items, { 属性: '冰' }).map(item => item.key), ['a']);
  assert.deepEqual(applyFacets(items, { 属性: '量子' }).map(item => item.key), ['b']);
  assert.deepEqual(applyFacets(items, { 属性: '__missing__' }).map(item => item.key), ['c']);
  assert.deepEqual(applyFacets(items, {}).map(item => item.key), ['a', 'b', 'c']);
  assert.deepEqual(applyFacets(items, { 属性: '冰', 星级: '5' }).map(item => item.key), []);
});

test('scopeCategory 与 categoriesInScope 按世界和赛季给出范围', () => {
  const categories = [
    { id: 'zzz/agents', name: '绝区零 · 代理人', count: 4 },
    { id: 'hsr/characters', name: '星铁 · 角色', count: 6 },
    { id: 'currency/season1/roles', name: '货币战争 S1 · 角色', count: 7 },
    { id: 'currency/season2/roles', name: '货币战争 S2 · 角色', count: 8 },
  ];
  assert.equal(scopeCategory('zzz'), 'zzz');
  assert.equal(scopeCategory('currency', 'season2'), 'currency/season2');
  assert.equal(scopeCategory(''), '');
  assert.deepEqual(categoriesInScope(categories, 'zzz').map(group => group.id), ['zzz/agents']);
  assert.deepEqual(categoriesInScope(categories, 'currency', 'season2').map(group => group.id), ['currency/season2/roles']);
  assert.deepEqual(categoriesInScope(categories, 'currency', 'season1').map(group => group.id), ['currency/season1/roles']);
});

test('filterItems 按 scope 限定世界范围', () => {
  const items = [
    { key: 'a', category: 'zzz/agents' },
    { key: 'b', category: 'hsr/characters' },
    { key: 'c', category: 'zzz/bangboo' },
  ];
  assert.deepEqual(filterItems(items, { scope: 'zzz' }).items.map(item => item.key), ['a', 'c']);
  assert.deepEqual(filterItems(items, { scope: 'zzz', category: 'zzz/agents' }).items.map(item => item.key), ['a']);
  assert.deepEqual(filterItems(items, {}).items.map(item => item.key), ['a', 'b', 'c']);
});

test('categoryChipLabel 去掉世界前缀，全部视图下带世界以区分同名分类', () => {
  assert.equal(categoryChipLabel('绝区零 · 代理人'), '代理人');
  assert.equal(categoryChipLabel('货币战争 S1 · 角色'), '角色');
  assert.equal(categoryChipLabel('星铁 · 遗器'), '遗器');
  assert.equal(categoryChipLabel('绝区零 · 代理人', { keepWorld: true }), '绝区零 代理人');
  assert.equal(categoryChipLabel('货币战争 S1 · 角色', { keepWorld: true }), '货币战争 S1 角色');
  assert.equal(categoryChipLabel('货币战争 S2 · 角色', { keepWorld: true }), '货币战争 S2 角色');
});

test('与网页端共用同一套二级筛选字段口径', async () => {
  const web = await import('../../src/concept/state.js');
  for (const [category, fields] of Object.entries(web.FILTER_FIELDS)) {
    assert.deepEqual(filterFieldsFor(`zzz/${category}`), fields, `${category} 字段口径不一致`);
  }
  // 原生端多出来的分类只能是空字段集，否则就与网页端口径分叉了。
  for (const category of Object.keys(web.FILTER_FIELDS)) {
    assert.ok(filterFieldsFor(`zzz/${category}`).length > 0, `${category} 不该是空字段集`);
  }
});

test('与网页端共用同一套分类 chip 文本', async () => {
  const web = await import('../../src/concept/state.js');
  const names = web.WORLDS.flatMap((world) => [
    { world: world.id, name: world.id === 'zzz' ? '绝区零 · 代理人' : world.id === 'hsr' ? '星铁 · 角色' : '货币战争 S1 · 角色' },
  ]);
  for (const entry of names) {
    const expected = entry.world === 'currency' ? '货币战争 S1 角色' : `${entry.name.split(' · ')[0]} ${entry.name.split(' · ')[1]}`;
    assert.equal(categoryChipLabel(entry.name, { keepWorld: true }), expected);
  }
});

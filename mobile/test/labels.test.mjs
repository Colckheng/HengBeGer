import assert from 'node:assert/strict';
import test from 'node:test';
import { categoryName, categoryWords, itemByKey, worldOf } from '../src/lib/labels.js';

const groups = [
  { id: 'zzz/agents', name: '绝区零 · 代理人' },
  { id: 'currency/season1/roles', name: '货币战争 S1 · 角色' },
];

test('categoryName：index.groups 命中时用服务端中文名', () => {
  assert.equal(categoryName('zzz/agents', groups), '绝区零 · 代理人');
  assert.equal(categoryName('currency/season1/roles', groups), '货币战争 S1 · 角色');
});

test('categoryName：拿不到 groups 时按世界 + 词表兜底', () => {
  assert.equal(categoryName('zzz/agents'), '绝区零 · 代理人');
  assert.equal(categoryName('hsr/light_cones'), '星穹铁道 · 光锥');
  assert.equal(categoryName('currency/season2/strategies'), '货币战争 · S2 · 投资策略');
});

test('categoryName：未知分类不炸，原样返回末段', () => {
  assert.equal(categoryName('zzz/unknown_thing'), '绝区零 · unknown_thing');
  assert.equal(categoryName(''), '');
});

test('categoryWords：赛季段单独提出来', () => {
  assert.equal(categoryWords('currency/season1/items'), 'S1 · 物品');
  assert.equal(categoryWords('hsr/enemies'), '敌人');
  assert.equal(categoryWords(''), '');
});

test('worldOf：按首段找世界，找不到返回 null', () => {
  assert.equal(worldOf('hsr/characters').title, '星穹铁道');
  assert.equal(worldOf('nope/x'), null);
});

test('itemByKey：建 key -> 名称/封面/分类 的映射', () => {
  const index = {
    items: [
      { key: 'zzz/agents/1011', name: '安比', image: '/img/t/a.webp', category: 'zzz/agents' },
      { key: 'hsr/characters/1001', rawName: '三月七', category: 'hsr/characters' },
    ],
  };
  const map = itemByKey(index);
  assert.deepEqual(map.get('zzz/agents/1011'), { name: '安比', image: '/img/t/a.webp', category: 'zzz/agents' });
  assert.deepEqual(map.get('hsr/characters/1001'), { name: '三月七', image: null, category: 'hsr/characters' });
  assert.equal(map.get('nope'), undefined);
  assert.equal(itemByKey(null).size, 0);
});

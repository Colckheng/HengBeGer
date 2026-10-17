import assert from 'node:assert/strict';
import test from 'node:test';
import { placeholderLabel } from '../src/lib/placeholder.js';

test('placeholderLabel：英文分类 id 换成中文短名（跟列表 chip 同一套词表）', () => {
  assert.equal(placeholderLabel('zzz/agents'), '代理人');
  assert.equal(placeholderLabel('zzz/bangboo'), '邦布');
  assert.equal(placeholderLabel('hsr/characters'), '角色');
  assert.equal(placeholderLabel('hsr/light_cones'), '光锥');
  assert.equal(placeholderLabel('zzz/enemies'), '敌人');
  assert.equal(placeholderLabel('hsr/relics'), '遗器');
});

test('placeholderLabel：货币战争的赛季前缀被丢掉，只留业务词', () => {
  assert.equal(placeholderLabel('currency/season1/roles'), '角色');
  assert.equal(placeholderLabel('currency/season2/roles'), '角色');
  assert.equal(placeholderLabel('currency/season1/strategies'), '投资策略');
  assert.equal(placeholderLabel('currency/season2/environments'), '投资环境');
});

test('placeholderLabel：分类本身就是赛季段时保留 S1/S2', () => {
  assert.equal(placeholderLabel('currency/season1'), 'S1');
  assert.equal(placeholderLabel('currency/season2'), 'S2');
});

test('placeholderLabel：空分类 / 只有世界名时退回「图录」', () => {
  assert.equal(placeholderLabel(''), '图录');
  assert.equal(placeholderLabel(null), '图录');
  assert.equal(placeholderLabel(undefined), '图录');
  assert.equal(placeholderLabel('zzz/'), '图录');
  assert.equal(placeholderLabel('zzz'), '图录');
});

test('placeholderLabel：中文长词按字截到四个字', () => {
  // 5 个字截到 4 个：驱动盘装（不满字但放得下）
  assert.equal(placeholderLabel('zzz/驱动盘装甲'), '驱动盘装');
  assert.equal(placeholderLabel('zzz/驱动盘'), '驱动盘');
  assert.equal(placeholderLabel('zzz/驱动盘装甲附属组件'), '驱动盘装');
});

test('placeholderLabel：词表没覆盖的英文长名不硬截，退回「图录」', () => {
  assert.equal(placeholderLabel('zzz/unknown_category'), '图录');
  assert.equal(placeholderLabel('hsr/new_stuff_2026'), '图录');
});

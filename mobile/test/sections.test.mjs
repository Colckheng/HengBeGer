import assert from 'node:assert/strict';
import test from 'node:test';
import { groupOfTitle, groupSections, isKeyValueTable, parseTable, splitBlocks, tableToKeyValues } from '../src/lib/sections.js';

test('groupOfTitle', () => {
  assert.equal(groupOfTitle('技能'), 'combat');
  assert.equal(groupOfTitle('晋阶'), 'growth');
  assert.equal(groupOfTitle('故事'), 'story');
  assert.equal(groupOfTitle('角色信息'), 'extra');
  assert.equal(groupOfTitle('概述'), 'overview');
});

test('parseTable', () => {
  const table = parseTable([
    '| 阵营 | 星核猎手 |',
    '| --- | --- |',
    '| 实装日期 | 2023/08/09 |',
  ].join(String.fromCharCode(10)));
  assert.deepEqual(table.headers, ['阵营', '星核猎手']);
  assert.deepEqual(table.rows, [['实装日期', '2023/08/09']]);
  assert.equal(parseTable('| a | b |'), null);
  assert.equal(parseTable(''), null);
});

test('splitBlocks', () => {
  const blocks = splitBlocks([
    '安比是一位电属性击破代理人。',
    '',
    '| 等级 | 项目 | 数据 |',
    '| --- | --- | --- |',
    '| 1 | 伤害倍率 | 31.2% |',
    '',
    '点按发动：向前方斩击。',
  ].join(String.fromCharCode(10)));
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].kind, 'text');
  assert.equal(blocks[1].kind, 'table');
  assert.equal(blocks[2].kind, 'text');
});

test('isKeyValueTable', () => {
  assert.equal(isKeyValueTable({ headers: ['a', 'b'], rows: [['1', '2']] }), true);
  assert.equal(isKeyValueTable({ headers: ['等级', '项目', '数据'], rows: [['1', 'a', 'x'], ['1', 'b', 'y']] }), true);
  assert.equal(isKeyValueTable(null), false);
});

test('tableToKeyValues', () => {
  const rows = tableToKeyValues({
    headers: ['等级', '项目', '数据'],
    rows: [['1', '伤害倍率', '31.2%'], ['1', '失衡倍率', '15.6%'], ['2', '伤害倍率', '34.1%']],
  });
  assert.deepEqual(rows, [
    { key: '1', value: '项目：伤害倍率　数据：31.2%' },
    { key: '1', value: '项目：失衡倍率　数据：15.6%' },
    { key: '2', value: '项目：伤害倍率　数据：34.1%' },
  ]);
});

test('tableToKeyValues 两列', () => {
  const rows = tableToKeyValues({
    headers: ['项目', '值'],
    rows: [['阵营', '星核猎手'], ['实装日期', '2023/08/09']],
  });
  assert.deepEqual(rows, [
    { key: '阵营', value: '星核猎手' },
    { key: '实装日期', value: '2023/08/09' },
  ]);
});

test('groupSections', () => {
  const sections = [
    { id: 's0', title: '概述', body: 'x' },
    { id: 's1', title: '角色信息', body: 'x' },
    { id: 's2', title: '晋阶', body: 'x' },
    { id: 's3', title: '行迹', body: 'x' },
    { id: 's4', title: '技能', body: 'x' },
    { id: 's5', title: '故事', body: 'x' },
    { id: 's6', title: '语音', body: 'x' },
    { id: 's7', title: '角色画廊', body: 'x' },
  ];
  const groups = groupSections(sections);
  assert.deepEqual(groups.map(g => g.id), ['overview', 'combat', 'growth', 'story', 'extra']);
  assert.equal(groups[0].fold, false);
  assert.equal(groups[2].fold, true);
  assert.deepEqual(groupSections([]), []);
  assert.deepEqual(groupSections(undefined), []);
});
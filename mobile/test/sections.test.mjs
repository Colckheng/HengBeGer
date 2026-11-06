import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildSections } from '../../server/openIndex.js';
import { groupOfTitle, groupSections, isKeyValueTable, parseTable, splitBlocks, tableToKeyValues } from '../src/lib/sections.js';
import * as sections from '../src/lib/sections.js';

test('站内链接只交给应用，外部链接交给系统', () => {
  const opened = [];
  assert.equal(sections.handleReaderLink('entry:game/character/1', key => opened.push(key)), false);
  assert.deepEqual(opened, ['game/character/1']);
  assert.equal(sections.handleReaderLink('https://example.com', key => opened.push(key)), true);
  assert.equal(opened.length, 1);
});

test('宽表保留全部行和超出表头的单元格', () => {
  const table = { headers: ['甲', '乙', '丙', '丁', '戊', '己'], rows: Array.from({ length: 23 }, (_, i) => [`行${i}`, '', '值', '', '', '', `额外${i}`]) };
  const rows = sections.wideTableRows(table);
  assert.equal(rows.length, 23);
  assert.equal(rows[22], '甲：行22　丙：值　额外22');
});

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

test('groupSections 保留同一分组第七节及其正文', () => {
  const sections = Array.from({ length: 7 }, (_, index) => ({
    id: `story-${index + 1}`,
    title: `故事 ${index + 1}`,
    body: `正文 ${index + 1}`,
  }));
  const [group] = groupSections(sections);
  assert.equal(group.id, 'story');
  assert.equal(group.fold, true);
  assert.deepEqual(group.sections.map(section => section.id), sections.map(section => section.id));
  assert.deepEqual(group.sections[6], {
    id: 'story-7',
    title: '故事 7',
    blocks: [{ kind: 'text', text: '正文 7' }],
  });
});

test('小节目录保留章节前言与实际标题和正文', () => {
  const body = '来源说明\n\n### 普攻\n普攻正文\n\n### 战技\n战技正文';
  const result = sections.readerParts(body);
  assert.equal(result.preamble, '来源说明\n\n');
  assert.deepEqual(result.parts.map(part => part.title), ['普攻', '战技']);
  assert.match(result.parts[0].body, /普攻正文/);
  assert.doesNotMatch(result.parts[0].body, /战技正文/);
  assert.match(result.parts[1].body, /战技正文/);
});

test('普通正文不会凭空生成小节', () => {
  assert.deepEqual(sections.readerParts('完整正文'), { preamble: '完整正文', parts: [] });
});

test('真实角色的小节切分不丢正文', () => {
  const body = readFileSync(new URL('../../data/hsr/characters/1001_三月七.md', import.meta.url), 'utf8');
  const section = buildSections(body).find(part => part.title === '行迹');
  assert.ok(section);
  const parts = sections.readerParts(section.body);
  assert.ok(parts.parts.length >= 10);
  assert.equal(parts.parts[0].title, '极寒的弓矢（普攻）');
  const covered = parts.parts.reduce((sum, part) => sum + part.body.length, 0) + parts.preamble.length;
  assert.equal(covered, section.body.length);
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
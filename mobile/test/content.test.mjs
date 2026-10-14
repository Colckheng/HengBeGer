import assert from 'node:assert/strict';
import test from 'node:test';
import { hasMeaningfulMarkdown, prepareReaderContent, prepareSections } from '../src/content/content.js';

test('复用仓库根的 contentModel：空正文判定', () => {
  assert.equal(hasMeaningfulMarkdown(''), false);
  assert.equal(hasMeaningfulMarkdown('   \n  '), false);
  assert.equal(hasMeaningfulMarkdown('普通说明'), true);
});

test('复用仓库根的 contentModel：章节分组、短标题、主章节与空章节过滤', () => {
  const sections = prepareSections({
    category: 'hsr/characters',
    sections: [
      { id: 'section-0', title: '概述', body: '这是概览。' },
      { id: 'section-1', title: '行迹', body: '这是技能。' },
      { id: 'section-2', title: '空章节', body: '   ' },
      { id: 'section-3', title: '来源与补充核验', body: '资料出处。' },
    ],
  });
  assert.deepEqual(sections.map((section) => section.id), ['section-0', 'section-1', 'section-3']);
  assert.equal(sections[0].group, '概览');
  assert.equal(sections[1].group, '战斗');
  assert.equal(sections[1].shortTitle, '技能详解');
  assert.equal(sections[1].isPrimary, true);
  assert.equal(sections[2].group, '来源');
  assert.deepEqual(sections.map((section) => section.isPrimary), [false, true, false]);
});

test('复用仓库根的 contentModel：正文表格改写只在泛型列时动手', () => {
  const body = [
    '### 技能',
    '',
    '| 等级 | 数值1 |',
    '| --- | --- |',
    '| 1 | 100 |',
    '| 2 | 200 |',
  ].join('\n');
  const rewritten = prepareReaderContent(body, 'hsr/characters/1415');
  assert.match(rewritten, /原始参数/);
  assert.ok(rewritten.includes('数值1'));
  const plain = prepareReaderContent('### 说明\n\n普通段落。', 'zzz/agents/1011');
  assert.equal(plain, '### 说明\n\n普通段落。');
});

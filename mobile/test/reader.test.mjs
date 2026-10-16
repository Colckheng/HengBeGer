import assert from 'node:assert/strict';
import test from 'node:test';
import { dropIdLines, entryKeyFromLink, entryLinksIn, isEntryLink, stripGameTags } from '../src/lib/reader.js';

test('stripGameTags：剥掉游戏内富文本标签但保留内部文字', () => {
  assert.equal(
    stripGameTags('获得<gridfightinfo type=item id=99999>和3金币。'),
    '获得和3金币。',
  );
  assert.equal(
    stripGameTags('获得<color=#b4b4b4>1费角色</color>的前台强度提高。'),
    '获得1费角色的前台强度提高。',
  );
  assert.equal(
    stripGameTags('进入<unbreak>#1[i]</unbreak>个新节点'),
    '进入#1[i]个新节点',
  );
  // 没有标签的正文原样返回
  assert.equal(stripGameTags('普通正文 **加粗**'), '普通正文 **加粗**');
  // 不碰 markdown 的链接/图片语法
  assert.equal(
    stripGameTags('见【[白厄](entry:currency/season1/roles/1408)】'),
    '见【[白厄](entry:currency/season1/roles/1408)】',
  );
});

test('dropIdLines：丢掉纯编号行', () => {
  assert.equal(dropIdLines('**ID**：1001\n## 说明\n开局时获得。'), '\n## 说明\n开局时获得。');
  assert.equal(dropIdLines('ID：1002\n正文'), '\n正文');
  // 带内容的行不能动
  assert.equal(dropIdLines('**ID**：1001 · **品质**：Silver'), '**ID**：1001 · **品质**：Silver');
  assert.equal(dropIdLines('ID 是这份资料的意思'), 'ID 是这份资料的意思');
});

test('entryLinksIn：取出正文里的站内条目 key', () => {
  assert.deepEqual(entryLinksIn('见【[白厄](entry:currency/season1/roles/1408)】和【[瑕蝶](entry:currency/season1/roles/1307)】'), [
    'currency/season1/roles/1408',
    'currency/season1/roles/1307',
  ]);
  // 同一个 key 重复出现只留一个
  assert.deepEqual(entryLinksIn('[a](entry:x/y) [b](entry:x/y)'), ['x/y']);
  assert.deepEqual(entryLinksIn('没有链接'), []);
});

test('isEntryLink / entryKeyFromLink：只认 entry: 协议', () => {
  assert.equal(isEntryLink('entry:currency/season1/roles/1408'), true);
  assert.equal(isEntryLink('https://example.com'), false);
  assert.equal(isEntryLink(undefined), false);
  assert.equal(entryKeyFromLink('entry:hsr/characters/1415'), 'hsr/characters/1415');
  assert.equal(entryKeyFromLink('https://example.com'), '');
});
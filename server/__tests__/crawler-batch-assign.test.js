import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listCandidates,
  assignItemsToFiles,
  resolveBatchDir,
  fmContentId,
} from '../../scripts/crawler/batch-assign.js';

const FIX = fileURLToPath(new URL('./fixtures/tmp-batch-assign/', import.meta.url));

function writeChar(filename, fmLines) {
  fs.mkdirSync(FIX, { recursive: true });
  const body = `---\ngame: "hsr"\ntype: "character"\ntags: [hsr, character]\n${fmLines}\n---\n\n# x\n`;
  fs.writeFileSync(path.join(FIX, filename), body, 'utf8');
}

beforeEach(() => {
  fs.rmSync(FIX, { recursive: true, force: true });
});

afterAll(() => {
  fs.rmSync(FIX, { recursive: true, force: true });
});

describe('fmContentId', () => {
  test('extracts content id from source_url', () => {
    expect(fmContentId({ source_url: 'https://www.miyoushe.com/sr/wiki/content/3128/detail' })).toBe(3128);
    expect(fmContentId({ source_url: 'https://wiki.komi.moe/nanoka/x/1011' })).toBeNull();
    expect(fmContentId({})).toBeNull();
    expect(fmContentId(null)).toBeNull();
  });
});

describe('assignItemsToFiles', () => {
  test('filters disambiguate 三月七 vs 仙舟三月七 regardless of item order', () => {
    writeChar('1001_三月七.md', 'id: "1001"\nname: "三月七"\n命途: "存护"\n属性: "冰"');
    writeChar('1224_三月七.md', 'id: "1224"\nname: "三月七"\n命途: "巡猎"\n属性: "虚数"');
    const cands = listCandidates(FIX);
    const items = [
      { content_id: 3121, title: '仙舟三月七', alias: '', filters: { 属性: '虚数', 命途: '巡猎', 星级: '四星' } },
      { content_id: 48, title: '三月七', alias: '', filters: { 属性: '冰', 命途: '存护', 星级: '四星' } },
    ];
    const a = assignItemsToFiles(items, cands);
    expect(a.assignments.get('48').file).toBe('1001_三月七.md');
    expect(a.assignments.get('3121').file).toBe('1224_三月七.md');
    expect(a.orphans).toEqual([]);
    const b = assignItemsToFiles([...items].reverse(), cands);
    expect(b.assignments.get('48').file).toBe(a.assignments.get('48').file);
    expect(b.assignments.get('3121').file).toBe(a.assignments.get('3121').file);
  });

  test('duplicate titles split across files by filters, own link wins, deterministic', () => {
    writeChar('8001_开拓者.md', 'id: "8001"\nname: "开拓者"\nalias: "开拓者·毁灭"\nsource_url: "https://www.miyoushe.com/sr/wiki/content/3128/detail"\n命途: "毁灭"\n属性: "物理"');
    writeChar('8002_开拓者.md', 'id: "8002"\nname: "开拓者"\n命途: "毁灭"\n属性: "物理"');
    writeChar('8004_开拓者.md', 'id: "8004"\nname: "开拓者"\n命途: "同谐"\n属性: "虚数"');
    writeChar('8005_开拓者.md', 'id: "8005"\nname: "开拓者"\n命途: "同谐"\n属性: "虚数"');
    const cands = listCandidates(FIX);
    const items = [
      { content_id: 872, title: '开拓者•同谐', alias: '', filters: { 星级: '五星', 命途: '同谐', 属性: '虚数' } },
      { content_id: 411, title: '开拓者•同谐', alias: '', filters: { 星级: '五星', 命途: '同谐', 属性: '虚数' } },
      { content_id: 3128, title: '开拓者·毁灭', alias: '', filters: { 星级: '五星', 命途: '毁灭', 属性: '物理' } },
      { content_id: 3124, title: '开拓者·毁灭', alias: '', filters: { 星级: '五星', 命途: '毁灭', 属性: '物理' } },
    ];
    const { assignments, orphans } = assignItemsToFiles(items, cands);
    expect(assignments.get('411').file).toBe('8004_开拓者.md');
    expect(assignments.get('872').file).toBe('8005_开拓者.md');
    expect(assignments.get('3124').file).toBe('8001_开拓者.md');
    expect(assignments.get('3128').file).toBe('8002_开拓者.md');
    expect(orphans).toEqual([]);
    const again = assignItemsToFiles(items, cands);
    expect([...again.assignments.entries()].map(([k, v]) => [k, v.file])).toEqual([
      ['411', '8004_开拓者.md'],
      ['872', '8005_开拓者.md'],
      ['3124', '8001_开拓者.md'],
      ['3128', '8002_开拓者.md'],
    ]);
  });

  test('unrelated item gets no file and leaves it orphaned', () => {
    writeChar('1001_三月七.md', 'id: "1001"\nname: "三月七"\n命途: "存护"\n属性: "冰"');
    const cands = listCandidates(FIX);
    const { assignments, orphans } = assignItemsToFiles([{ content_id: 999, title: '呜呜伯', alias: '', filters: {} }], cands);
    expect(assignments.get('999')).toBeNull();
    expect(orphans).toEqual(['1001_三月七.md']);
  });
});

describe('resolveBatchDir', () => {
  test('resolves absolute paths and reports orphan files', () => {
    writeChar('1001_三月七.md', 'id: "1001"\nname: "三月七"\n命途: "存护"\n属性: "冰"');
    writeChar('2001_孤儿.md', 'id: "2001"\nname: "孤儿"');
    const { assignments, orphans } = resolveBatchDir(
      [{ content_id: 48, title: '三月七', alias: '', filters: { 命途: '存护' } }],
      FIX,
    );
    expect(assignments.get('48')).toBe(path.join(FIX, '1001_三月七.md'));
    expect(assignments.get('2001') ?? null).toBeNull();
    expect(orphans).toEqual(['2001_孤儿.md']);
  });
});

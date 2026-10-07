import fs from 'fs';
import os from 'os';
import path from 'path';
import { diffFileContent, diffSnapshots, snapshot } from '../../scripts/crawler/diff.js';

describe('crawler diff', () => {
  let dirA;
  let dirB;

  beforeEach(() => {
    dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-a-'));
    dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-b-'));
  });

  afterEach(() => {
    fs.rmSync(dirA, { recursive: true, force: true });
    fs.rmSync(dirB, { recursive: true, force: true });
  });

  test('snapshot captures md and json, skips images', () => {
    fs.mkdirSync(path.join(dirA, 'zzz'), { recursive: true });
    fs.mkdirSync(path.join(dirA, 'images'), { recursive: true });
    fs.writeFileSync(path.join(dirA, 'zzz', 'a.md'), '---\nid: 1\n---\n# a\n');
    fs.writeFileSync(path.join(dirA, 'zzz', 'state.json'), '{}');
    fs.writeFileSync(path.join(dirA, 'images', 'x.png'), 'binary');
    const snap = snapshot(dirA);
    expect([...snap.keys()].sort()).toEqual(['zzz/a.md', 'zzz/state.json']);
  });

  test('diffSnapshots classifies add/modify/delete', () => {
    fs.writeFileSync(path.join(dirA, 'keep.md'), 'same');
    fs.writeFileSync(path.join(dirA, 'change.md'), 'v1');
    fs.writeFileSync(path.join(dirA, 'gone.md'), 'x');
    fs.writeFileSync(path.join(dirB, 'keep.md'), 'same');
    fs.writeFileSync(path.join(dirB, 'change.md'), 'v2');
    fs.writeFileSync(path.join(dirB, 'fresh.md'), 'y');
    const result = diffSnapshots(snapshot(dirA), snapshot(dirB));
    expect(result).toEqual({ added: ['fresh.md'], modified: ['change.md'], deleted: ['gone.md'] });
  });

  test('diffFileContent reports front-matter and body changes', () => {
    const before = '---\nid: 1\nname: "旧"\nversion: "1.0"\n---\n# 旧\n\n| 项目 | 值 |\n| - | - |\n| 1 | a |\n';
    const after = '---\nid: 1\nname: "新"\nversion: "2.0"\n---\n# 新\n\n| 项目 | 值 |\n| - | - |\n| 1 | b |\n| 2 | c |\n';
    const result = diffFileContent(before, after);
    expect(result.frontMatter).toEqual([
      { key: 'name', from: '"旧"', to: '"新"' },
      { key: 'version', from: '"1.0"', to: '"2.0"' },
    ]);
    expect(result.body.linesAdded).toBeGreaterThan(0);
    expect(result.body.linesRemoved).toBeGreaterThan(0);
    expect(result.body.tableRowsBefore).toBe(1);
    expect(result.body.tableRowsAfter).toBe(2);
  });

  test('identical files produce empty diff', () => {
    fs.writeFileSync(path.join(dirA, 'x.md'), 'same');
    fs.writeFileSync(path.join(dirB, 'x.md'), 'same');
    const result = diffSnapshots(snapshot(dirA), snapshot(dirB));
    expect(result).toEqual({ added: [], modified: [], deleted: [] });
    const detail = diffFileContent('same', 'same');
    expect(detail.frontMatter).toEqual([]);
    expect(detail.body.linesAdded).toBe(0);
    expect(detail.body.linesRemoved).toBe(0);
  });
});

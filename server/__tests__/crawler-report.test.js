import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  assertSyncAllowed,
  buildReport,
  listReports,
  loadReport,
  markConfirmed,
  treeHash,
} from '../../scripts/crawler/report.js';
import { snapshot } from '../../scripts/crawler/diff.js';

describe('crawler report gate', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'report-'));
    fs.mkdirSync(path.join(root, 'data'), { recursive: true });
    fs.writeFileSync(path.join(root, 'data', 'a.md'), '---\nid: 1\n---\n# a\n');
    fs.writeFileSync(path.join(root, 'data', 'b.md'), '---\nid: 2\n---\n# b\n');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function makeDiff() {
    const before = snapshot(path.join(root, 'data'));
    fs.appendFileSync(path.join(root, 'data', 'a.md'), '新增一行\n');
    fs.unlinkSync(path.join(root, 'data', 'b.md'));
    fs.writeFileSync(path.join(root, 'data', 'c.md'), '---\nid: 3\n---\n# c\n');
    const after = snapshot(path.join(root, 'data'));
    return { before, after };
  }

  test('buildReport writes md and json sidecar', () => {
    const { before, after } = makeDiff();
    const diff = { added: ['data/c.md'], modified: ['data/a.md'], deleted: ['data/b.md'] };
    const meta = buildReport(root, { diff, snapshotBefore: before, snapshotAfter: after });
    const mdPath = path.join(root, 'reports', `${meta.id}.md`);
    expect(fs.existsSync(mdPath)).toBe(true);
    const stored = loadReport(root, meta.id);
    expect(stored.confirmed).toBe(false);
    expect(stored.gitCommit).toBeDefined();
    expect(stored.treeHash).toBe(treeHash(after));
    const md = fs.readFileSync(mdPath, 'utf8');
    expect(md).toContain('数据变更报告');
    expect(md).toContain('新增 1 / 修改 1 / 删除 1');
    expect(md).toContain('未确认前禁止同步入库');
    expect(md).toContain(`npm run sync -- --report ${meta.id}`);
  });

  test('sync refuses unconfirmed report', () => {
    const { before, after } = makeDiff();
    const meta = buildReport(root, {
      diff: { added: [], modified: [], deleted: [] },
      snapshotBefore: before,
      snapshotAfter: after,
    });
    expect(() => assertSyncAllowed(root, meta.id, meta.treeHash)).toThrow('not confirmed');
  });

  test('sync refuses when data changed after review', () => {
    const { before, after } = makeDiff();
    const meta = buildReport(root, {
      diff: { added: ['data/c.md'], modified: ['data/a.md'], deleted: ['data/b.md'] },
      snapshotBefore: before,
      snapshotAfter: after,
    });
    markConfirmed(root, meta.id);
    expect(() => assertSyncAllowed(root, meta.id, 'different-hash')).toThrow('does not match');
    expect(() => assertSyncAllowed(root, meta.id, meta.treeHash)).not.toThrow();
  });

  test('sync refuses unknown report id', () => {
    expect(() => assertSyncAllowed(root, '99999999-9999', null)).toThrow('report not found');
  });

  test('markConfirmed flips state and confirmedAt', () => {
    const { before, after } = makeDiff();
    const meta = buildReport(root, {
      diff: { added: [], modified: [], deleted: [] },
      snapshotBefore: before,
      snapshotAfter: after,
    });
    const confirmed = markConfirmed(root, meta.id);
    expect(confirmed.confirmed).toBe(true);
    expect(confirmed.confirmedAt).toBeDefined();
    expect(loadReport(root, meta.id).confirmed).toBe(true);
  });

  test('listReports returns ids sorted', () => {
    const { before, after } = makeDiff();
    buildReport(root, {
      diff: { added: [], modified: [], deleted: [] },
      snapshotBefore: before,
      snapshotAfter: after,
      now: new Date('2026-10-06T10:00:00'),
    });
    buildReport(root, {
      diff: { added: [], modified: [], deleted: [] },
      snapshotBefore: before,
      snapshotAfter: after,
      now: new Date('2026-10-06T11:00:00'),
    });
    const ids = listReports(root);
    expect(ids).toHaveLength(2);
    expect(ids[0] < ids[1]).toBe(true);
  });
});

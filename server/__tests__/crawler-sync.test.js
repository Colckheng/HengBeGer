import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseArgs, runSync } from '../../scripts/sync.js';
import { snapshot } from '../../scripts/crawler/diff.js';
import { treeHash } from '../../scripts/crawler/report.js';

const REPORT_ID = '20990101-0830';

function makeRoot({ confirmed = false, tamperData = false, withReport = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hbg-sync-'));
  fs.mkdirSync(path.join(root, 'data', 'zzz', 'agents'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'data', 'zzz', 'agents', '1011_安比.md'),
    '---\nid: 1011\nname: 安比\nimage: ""\n---\n\n| 键 | 值 |\n|---|---|\n| attack | 100 |\n',
    'utf8',
  );
  if (withReport) {
    const hash = treeHash(snapshot(path.join(root, 'data')));
    if (tamperData) {
      fs.writeFileSync(
        path.join(root, 'data', 'zzz', 'agents', '1011_安比.md'),
        '---\nid: 1011\nname: 安比\nimage: ""\n---\n\n| 键 | 值 |\n|---|---|\n| attack | 999 |\n',
        'utf8',
      );
    }
    const meta = {
      id: REPORT_ID,
      createdAt: '2099-01-01T08:30:00.000Z',
      gitCommit: null,
      treeHash: hash,
      files: { added: [], modified: ['zzz/agents/1011_安比.md'], deleted: [] },
      details: { 'zzz/agents/1011_安比.md': { frontMatter: [], body: {} } },
      anomalies: [],
      confirmed,
      syncCommand: `npm run sync -- --report ${REPORT_ID}`,
    };
    if (confirmed) meta.confirmedAt = '2099-01-01T09:00:00.000Z';
    fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
    fs.writeFileSync(path.join(root, 'reports', `${REPORT_ID}.json`), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  }
  return root;
}

function run(root, opts) {
  const lines = [];
  const code = runSync(root, opts, (m) => lines.push(String(m)));
  return { code, out: lines.join('\n') };
}

const roots = [];
afterEach(() => {
  for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true });
});

describe('parseArgs', () => {
  test('parses report, apply and list', () => {
    expect(parseArgs(['--report', 'abc', '--apply'])).toMatchObject({ report: 'abc', apply: true, list: false });
    expect(parseArgs(['--list'])).toMatchObject({ list: true, report: null });
    expect(parseArgs(['--help'])).toMatchObject({ help: true });
    expect(parseArgs(['--bogus'])).toMatchObject({ unknown: '--bogus' });
  });

  test('bare positional token is treated as report id (PowerShell npm path)', () => {
    expect(parseArgs(['20261007-1606'])).toMatchObject({ report: '20261007-1606' });
    expect(parseArgs(['--report', 'abc', 'def'])).toMatchObject({ report: 'abc', unknown: 'def' });
  });
});

describe('runSync 门禁', () => {
  test('未确认报告必须拒绝同步（T2.8 验收）', () => {
    const root = makeRoot({ confirmed: false });
    roots.push(root);
    const { code, out } = run(root, { report: REPORT_ID });
    expect(code).toBe(1);
    expect(out).toContain('同步被拒绝');
    expect(out).toContain('is not confirmed; sync refused');
    expect(out).toContain('未确认');
  });

  test('位置参数报告 ID 同样被拒绝（PowerShell npm 传参路径）', () => {
    const root = makeRoot({ confirmed: false });
    roots.push(root);
    const { code, out } = run(root, parseArgs([REPORT_ID]));
    expect(code).toBe(1);
    expect(out).toContain('同步被拒绝');
    expect(out).toContain('is not confirmed; sync refused');
  });

  test('已确认且数据未变时通过门禁并干跑', () => {
    const root = makeRoot({ confirmed: true });
    roots.push(root);
    const { code, out } = run(root, { report: REPORT_ID });
    expect(code).toBe(0);
    expect(out).toContain('门禁校验通过');
    expect(out).toContain('干跑模式');
    expect(out).toContain('zzz/agents/1011_安比.md');
  });

  test('确认后数据又变动必须拒绝', () => {
    const root = makeRoot({ confirmed: true, tamperData: true });
    roots.push(root);
    const { code, out } = run(root, { report: REPORT_ID });
    expect(code).toBe(1);
    expect(out).toContain('同步被拒绝');
    expect(out).toContain('does not match current data/ state');
  });

  test('报告不存在拒绝', () => {
    const root = makeRoot({ withReport: false });
    roots.push(root);
    const { code, out } = run(root, { report: '19990101-0000' });
    expect(code).toBe(1);
    expect(out).toContain('报告不存在');
  });

  test('缺少 --report 拒绝', () => {
    const root = makeRoot();
    roots.push(root);
    const { code, out } = run(root, {});
    expect(code).toBe(1);
    expect(out).toContain('缺少报告 ID');
  });

  test('未知参数打印用法', () => {
    const root = makeRoot();
    roots.push(root);
    const { code, out } = run(root, { unknown: '--nope' });
    expect(code).toBe(1);
    expect(out).toContain('用法');
  });
});

describe('runSync 展示', () => {
  test('--list 列出报告与确认状态', () => {
    const root = makeRoot({ confirmed: false });
    roots.push(root);
    const { code, out } = run(root, { list: true });
    expect(code).toBe(0);
    expect(out).toContain(REPORT_ID);
    expect(out).toContain('未确认');
  });

  test('--list 无报告', () => {
    const root = makeRoot({ withReport: false });
    roots.push(root);
    const { code, out } = run(root, { list: true });
    expect(code).toBe(0);
    expect(out).toContain('（无报告）');
  });
});

describe('runSync --apply', () => {
  test('门禁通过后 --apply 提示 T3.2 未实现并拒绝', () => {
    const root = makeRoot({ confirmed: true });
    roots.push(root);
    const { code, out } = run(root, { report: REPORT_ID, apply: true });
    expect(code).toBe(1);
    expect(out).toContain('门禁校验通过');
    expect(out).toContain('--apply 数据库同步尚未实现');
  });
});

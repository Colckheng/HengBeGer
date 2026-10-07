import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFetcher } from './crawler/fetcher.js';
import {
  createBwikiSource,
  parseInfobox,
  mapZzzFields,
  mapHsrFields,
  compareFields,
  parseGachaPeriods,
  matchGachaPeriod,
} from './crawler/sources/bwiki.js';
import {
  findExistingFile,
  readEntityFile,
  writeEntityFile,
  renderDoc,
  splitSections,
  validateRendered,
  touchState,
} from './crawler/writer.js';
import { snapshot, diffSnapshots } from './crawler/diff.js';
import { buildReport } from './crawler/report.js';
import { STATUS_LABEL, pad } from './crawler/compare.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_ROOT = path.join(ROOT, 'data');

const TARGETS = {
  'zzz-agent': {
    dir: ['zzz', 'agents'],
    wiki: 'zzz',
    map: mapZzzFields,
    fields: ['alias', '阵营', '属性', '特性', '攻击方式'],
  },
  'hsr-character': {
    dir: ['hsr', 'characters'],
    wiki: 'sr',
    map: mapHsrFields,
    fields: ['alias', '命途', '属性', '阵营'],
  },
};

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function splitSpec(spec) {
  const i = spec.indexOf(':');
  return i === -1 ? [spec, undefined] : [spec.slice(0, i), spec.slice(i + 1)];
}

async function runCheck(src, spec) {
  const [tname, sel] = splitSpec(spec);
  const target = TARGETS[tname];
  if (!target) throw new Error(`未知抽查目标 ${tname}`);
  if (!sel) throw new Error(`--check ${tname} 需要 :标题 选择器`);
  const { html, title } = await src.getPage(target.wiki, sel);
  const bwikiFields = target.map(parseInfobox(html));
  const dir = path.join(DATA_ROOT, ...target.dir);
  const existingPath = findExistingFile(dir, [sel, title]);
  if (!existingPath) {
    console.log(`[抽查] ${spec} → data 中未找到对应文件`);
    return { count: 0, diffs: 0, missing: 1 };
  }
  const { fm } = readEntityFile(existingPath);
  const dataFm = {};
  for (const f of target.fields) {
    const v = f === 'alias' ? fm.alias || fm.name : fm[f];
    if (v !== undefined && v !== null && String(v).trim() !== '') dataFm[f] = v;
  }
  const rows = compareFields(dataFm, bwikiFields).filter((r) => r.status !== 'empty');
  console.log(`[抽查] ${spec}  BWIKI页「${title}」  data: ${path.relative(ROOT, existingPath)}`);
  console.log(`  ${pad('字段', 10)}${pad('data', 18)}${pad('BWIKI', 18)}状态`);
  for (const r of rows) {
    console.log(`  ${pad(r.field, 10)}${pad(r.data, 18)}${pad(r.source, 18)}${STATUS_LABEL[r.status] || r.status}`);
  }
  const diffs = rows.filter((r) => r.status === 'diff').length;
  console.log(`  合计 ${rows.length} 项，差异 ${diffs} 项\n`);
  return { count: rows.length, diffs, missing: 0 };
}

async function prepareGacha(src) {
  const { html, title } = await src.getPage('zzz', '调频');
  const periods = parseGachaPeriods(html);
  const dir = path.join(DATA_ROOT, 'zzz', 'gacha');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md') && f !== '_index.md');
  const updates = [];
  const unmatched = [];
  const unchanged = [];
  for (const f of files) {
    const p = path.join(dir, f);
    const { fm, body } = readEntityFile(p);
    const m = matchGachaPeriod(fm.start_time, fm.end_time, periods);
    if (!m) {
      unmatched.push({ file: f, start: fm.start_time, end: fm.end_time });
      continue;
    }
    if (fm.version === m.version) {
      unchanged.push({ file: f, version: m.version });
      continue;
    }
    updates.push({ path: p, file: f, from: fm.version, to: m.version, title: m.title, time: m.time, fm, body });
  }
  console.log(`[卡池版本富化] BWIKI页「${title}」 解析出 ${periods.length} 个调频期`);
  for (const u of updates) {
    console.log(`  [更新] ${u.file}: version ${u.from} → ${u.to}${u.title ? `（${u.title}）` : ''}`);
  }
  for (const u of unmatched) {
    console.log(`  [未匹配] ${u.file}: ${u.start} ~ ${u.end} 在 BWIKI 调频表中无对应期`);
  }
  for (const u of unchanged) {
    console.log(`  [无变化] ${u.file}: version 已是 ${u.version}`);
  }
  return { dir, periods, updates, unmatched };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const checks = String(args.check || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const doGacha = Boolean(args.gacha);
  if (!checks.length && !doGacha) {
    console.log('用法: node scripts/crawl-bwiki.js [--check <目标:标题>[,...]] [--gacha] [--write]');
    console.log('  --check: zzz-agent | hsr-character（字段抽查比对，不落盘）');
    console.log('  --gacha: 拉取 /zzz/调频 期表，为 data/zzz/gacha 回填 version');
    console.log('  --write: 落盘并生成报告（仅 gacha 需要）');
    console.log('  示例: node scripts/crawl-bwiki.js --check zzz-agent:安比,hsr-character:三月七');
    process.exit(1);
  }

  const write = Boolean(args.write);
  const fetcher = createFetcher({ rateLimitMs: 9000, backoffMs: 30000, proxy: process.env.http_proxy || null });
  const src = createBwikiSource(fetcher);

  const summary = { count: 0, diffs: 0, missing: 0 };
  for (const spec of checks) {
    const r = await runCheck(src, spec);
    summary.count += r.count;
    summary.diffs += r.diffs;
    summary.missing += r.missing;
  }

  let gacha = null;
  if (doGacha) gacha = await prepareGacha(src);

  if (gacha && gacha.updates.length) {
    if (!write) {
      console.log(`\n预览模式：${gacha.updates.length} 个文件待更新，加 --write 落盘并生成报告`);
    } else {
      const before = snapshot(DATA_ROOT);
      let bad = 0;
      const texts = gacha.updates.map((u) => {
        const fm = { ...u.fm, version: u.to, last_crawled_at: new Date().toISOString() };
        const { preamble, sections } = splitSections(u.body);
        const content = sections.map((s) => ({ heading: s.heading, content: s.lines.join('\n') }));
        const text = renderDoc(fm, content, preamble);
        const v = validateRendered(text);
        if (v.errors.length) bad += 1;
        return { u, fm, text, v };
      });
      for (const t of texts) {
        console.log(`[写入] ${path.relative(ROOT, t.u.path)}${t.v.errors.length ? `  错误: ${t.v.errors.join('; ')}` : ''}`);
      }
      if (bad) {
        console.log(`校验失败（${bad} 个文件有错误），未生成报告`);
        process.exit(2);
      }
      for (const t of texts) writeEntityFile(path.dirname(t.u.path), t.u.file, t.fm, t.text);
      touchState(gacha.dir, {});
      const after = snapshot(DATA_ROOT);
      const diff = diffSnapshots(before, after);
      const report = buildReport(ROOT, { diff, snapshotBefore: before, snapshotAfter: after });
      console.log(`\n已写入 ${texts.length} 个文件`);
      console.log(`报告: ${report && report.id ? report.id : path.join(ROOT, 'reports', '*.md')}`);
      console.log('确认后执行: npm run sync -- --report <报告id>');
    }
  }

  const failed = summary.missing > 0;
  if (failed) console.log(`抽查有 ${summary.missing} 个目标未找到 data 文件`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});

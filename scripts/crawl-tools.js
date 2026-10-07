import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFetcher } from './crawler/fetcher.js';
import { createBittopupSource, parseBannerPayload, matchPoolVersion } from './crawler/sources/bittopup.js';
import { createAppfengSource, parseMonster } from './crawler/sources/appfeng.js';
import { createSrsSource, parseCharacter as parseSrsCharacter, findSlug } from './crawler/sources/srs.js';
import { createZzzggSource, parseCharacter as parseZzzCharacter } from './crawler/sources/zzzgg.js';
import { compareFields, STATUS_LABEL, pad } from './crawler/compare.js';
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_ROOT = path.join(ROOT, 'data');

const TARGETS = {
  zzzgg: { dir: ['zzz', 'agents'], label: 'zzz.gg', fields: ['alias', '阵营', '属性', '特性'] },
  srs: { dir: ['hsr', 'characters'], label: 'SRS', fields: ['alias', '命途', '属性', '星级'] },
  appfeng: { dir: ['hsr', 'enemies'], label: 'appfeng', fields: ['alias', '阵营', '评级', '弱点'] },
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

function pickDataFm(target, fm, fallbackFile) {
  const dataFm = {};
  for (const f of target.fields) {
    const v = f === 'alias' ? fm.alias || fm.name : fm[f];
    if (v !== undefined && v !== null && String(v).trim() !== '') dataFm[f] = v;
  }
  return { dataFm, rel: fallbackFile ? path.relative(ROOT, fallbackFile) : '-' };
}

function printRows(spec, header, target, dataFm, sourceFields, rel) {
  const rows = compareFields(dataFm, sourceFields).filter((r) => r.status !== 'empty');
  console.log(`[抽查] ${spec}  ${header}  data: ${rel}`);
  console.log(`  ${pad('字段', 12)}${pad('data', 18)}${pad(target.label, 18)}状态`);
  for (const r of rows) {
    console.log(`  ${pad(r.field, 12)}${pad(r.data, 18)}${pad(r.source, 18)}${STATUS_LABEL[r.status] || r.status}`);
  }
  const diffs = rows.filter((r) => r.status === 'diff').length;
  console.log(`  合计 ${rows.length} 项，差异 ${diffs} 项\n`);
  return { count: rows.length, diffs, missing: 0 };
}

async function runCheckZzzgg(src, spec, sel) {
  const target = TARGETS.zzzgg;
  const dir = path.join(DATA_ROOT, ...target.dir);
  const existingPath = findExistingFile(dir, [sel]);
  if (!existingPath) {
    console.log(`[抽查] ${spec} → data 中未找到对应文件`);
    return { count: 0, diffs: 0, missing: 1 };
  }
  const { fm } = readEntityFile(existingPath);
  const html = await src.getCharacter(sel);
  const sourceFields = parseZzzCharacter(html);
  const { dataFm, rel } = pickDataFm(target, fm, existingPath);
  return printRows(spec, `zzz.gg页「${sel}」`, target, dataFm, sourceFields, rel);
}

async function runCheckSrs(src, spec, sel) {
  const target = TARGETS.srs;
  const dir = path.join(DATA_ROOT, ...target.dir);
  const existingPath = findExistingFile(dir, [sel]);
  if (!existingPath) {
    console.log(`[抽查] ${spec} → data 中未找到对应文件`);
    return { count: 0, diffs: 0, missing: 1 };
  }
  const { fm } = readEntityFile(existingPath);
  const listHtml = await src.getList();
  const slug = findSlug(listHtml, fm.alias || fm.name || sel, fm['命途']);
  if (!slug) {
    console.log(`[抽查] ${spec} → SRS 列表中未找到「${fm.alias || fm.name}」`);
    return { count: 0, diffs: 0, missing: 1 };
  }
  const html = await src.getCharacter(slug);
  const sourceFields = parseSrsCharacter(html);
  const { dataFm, rel } = pickDataFm(target, fm, existingPath);
  return printRows(spec, `SRS页「${sel}」 slug=${slug}`, target, dataFm, sourceFields, rel);
}

async function runCheckAppfeng(src, spec, sel) {
  const target = TARGETS.appfeng;
  const dir = path.join(DATA_ROOT, ...target.dir);
  let id = null;
  let existingPath = null;
  if (/^\d+$/.test(sel)) {
    id = sel;
    const files = fs.readdirSync(dir).filter((f) => f.startsWith(`${sel}_`) && f.endsWith('.md'));
    if (files.length) existingPath = path.join(dir, files[0]);
  } else {
    existingPath = findExistingFile(dir, [sel]);
    if (existingPath) id = path.basename(existingPath).split('_')[0];
  }
  if (!id) {
    console.log(`[抽查] ${spec} → data 中未找到对应文件（可用数字 ID 直查）`);
    return { count: 0, diffs: 0, missing: 1 };
  }
  const html = await src.getMonster(id);
  const sourceFields = parseMonster(html);
  const fm = existingPath ? readEntityFile(existingPath).fm : {};
  const { dataFm, rel } = pickDataFm(target, fm, existingPath);
  const title = sourceFields.alias || (existingPath ? path.basename(existingPath, '.md') : id);
  return printRows(spec, `appfeng页「${title}」 id=${id}`, target, dataFm, sourceFields, rel);
}

function extractPoolUps(body) {
  const ups = [];
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const cells = t.split('|').map((c) => c.trim());
    if (cells.length < 5) continue;
    const name = cells[3];
    if (!name || name === '名称' || /^-+$/.test(name)) continue;
    ups.push(name);
  }
  return ups;
}

async function prepareGacha(src) {
  const html = await src.getBannerPage();
  const banners = parseBannerPayload(html);
  if (!banners.length) throw new Error('bittopup banner 页未解析出 payload');
  const dir = path.join(DATA_ROOT, 'hsr', 'gacha');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md') && f !== '_index.md');
  const updates = [];
  const unmatched = [];
  const unchanged = [];
  for (const f of files) {
    const p = path.join(dir, f);
    const { fm, body } = readEntityFile(p);
    const ups = extractPoolUps(body);
    const m = matchPoolVersion({ start: fm.start_time, end: fm.end_time, ups }, banners);
    if (!m) {
      unmatched.push({ file: f, start: fm.start_time, end: fm.end_time });
      continue;
    }
    const version = m.half ? `${m.version}${m.half}` : m.version;
    if (fm.version === version) {
      unchanged.push({ file: f, version });
      continue;
    }
    updates.push({ path: p, file: f, from: fm.version, to: version, fm, body });
  }
  console.log(`[卡池版本富化] bittopup 页解析出 ${banners.length} 个版本（${banners[0].version} ~ ${banners[banners.length - 1].version}）`);
  for (const u of updates) console.log(`  [更新] ${u.file}: version ${u.from} → ${u.to}`);
  for (const u of unmatched) console.log(`  [未匹配] ${u.file}: ${u.start} ~ ${u.end} 不在 bittopup banner 历史范围内`);
  for (const u of unchanged) console.log(`  [无变化] ${u.file}: version 已是 ${u.version}`);
  return { dir, banners, updates, unmatched };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const checks = String(args.check || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const doGacha = Boolean(args.gacha);
  if (!checks.length && !doGacha) {
    console.log('用法: node scripts/crawl-tools.js [--check <目标:名字>[,...]] [--gacha] [--write]');
    console.log('  --check: zzzgg | srs | appfeng（字段抽查比对，不落盘）');
    console.log('  --gacha: 拉取 bittopup 跃迁历史，为 data/hsr/gacha 回填 version');
    console.log('  --write: 落盘并生成报告（仅 gacha 需要）');
    console.log('  示例: node scripts/crawl-tools.js --check zzzgg:猫又,appfeng:合金保姆');
    process.exit(1);
  }

  const write = Boolean(args.write);
  const fetcher = createFetcher({ rateLimitMs: 2000, backoffMs: 30000, proxy: process.env.http_proxy || null });
  const bittopup = createBittopupSource(fetcher);
  const appfeng = createAppfengSource(fetcher);
  const srs = createSrsSource(fetcher);
  const zzzgg = createZzzggSource(fetcher);

  const summary = { count: 0, diffs: 0, missing: 0 };
  for (const spec of checks) {
    const [tname, sel] = splitSpec(spec);
    const target = TARGETS[tname];
    if (!target) throw new Error(`未知抽查目标 ${tname}`);
    if (!sel) throw new Error(`--check ${tname} 需要 :名字 选择器`);
    let r;
    if (tname === 'zzzgg') r = await runCheckZzzgg(zzzgg, spec, sel);
    else if (tname === 'srs') r = await runCheckSrs(srs, spec, sel);
    else r = await runCheckAppfeng(appfeng, spec, sel);
    summary.count += r.count;
    summary.diffs += r.diffs;
    summary.missing += r.missing;
  }

  let gacha = null;
  if (doGacha) gacha = await prepareGacha(bittopup);

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
      console.log(`确认后执行: npm run sync -- --report ${report ? report.id : '<报告id>'}`);
    }
  }

  const failed = summary.missing > 0;
  if (failed) console.log(`抽查有 ${summary.missing} 个目标未通过`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});

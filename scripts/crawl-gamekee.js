import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFetcher } from './crawler/fetcher.js';
import {
  createGameKeeSource,
  findCategory,
  extractProfile,
  mapGkAgentFields,
  mapGkWeaponFields,
} from './crawler/sources/gamekee.js';
import { compareFields, STATUS_LABEL, pad } from './crawler/compare.js';
import { findExistingFile, readEntityFile, normalizeName } from './crawler/writer.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_ROOT = path.join(ROOT, 'data');

const TARGETS = {
  'zzz-agent': {
    dir: ['zzz', 'agents'],
    category: ['角色图鉴', '角色'],
    fields: ['alias', '阵营', '属性', '特性'],
    map: mapGkAgentFields,
  },
  'zzz-sound-engine': {
    dir: ['zzz', 'sound_engines'],
    category: ['音擎图鉴', '音擎'],
    fields: ['alias', '基础攻击力'],
    map: mapGkWeaponFields,
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

function pickLeaf(leaves, names) {
  const targets = [...new Set(names.filter(Boolean).map(normalizeName))];
  for (const t of targets) {
    const exact = leaves.find((l) => normalizeName(l.name) === t);
    if (exact) return exact;
  }
  for (const t of targets) {
    const prefix = leaves.filter((l) => normalizeName(l.name).startsWith(t));
    if (prefix.length === 1) return prefix[0];
  }
  return null;
}

async function runCheck(src, spec) {
  const [tname, sel] = splitSpec(spec);
  const target = TARGETS[tname];
  if (!target) throw new Error(`未知抽查目标 ${tname}`);
  if (!sel) throw new Error(`--check ${tname} 需要 :名字 选择器`);
  const dir = path.join(DATA_ROOT, ...target.dir);
  const existingPath = findExistingFile(dir, [sel]);
  if (!existingPath) {
    console.log(`[抽查] ${spec} → data 中未找到对应文件`);
    return { count: 0, diffs: 0, missing: 1 };
  }
  const { fm } = readEntityFile(existingPath);
  const tree = await src.getEntryList();
  const cat = findCategory(tree, target.category);
  if (!cat) throw new Error(`GameKee 栏目树中找不到 ${target.category.join('>')}`);
  const leaves = await src.getTreesByPid(cat.id);
  const leaf = pickLeaf(leaves, [fm.alias, fm.name, sel]);
  if (!leaf || !leaf.content_id) {
    console.log(`[抽查] ${spec} → GameKee 叶子中未找到「${fm.alias || fm.name}」`);
    return { count: 0, diffs: 0, missing: 1 };
  }
  const detail = await src.getContentDetail(leaf.content_id);
  const profile = detail ? extractProfile(detail.content_json) : null;
  if (!profile) {
    console.log(`[抽查] ${spec} → content_id=${leaf.content_id} 无 profile 结构`);
    return { count: 0, diffs: 0, missing: 1 };
  }
  const sourceFields = target.map(profile);
  const dataFm = {};
  for (const f of target.fields) {
    const v = f === 'alias' ? fm.alias || fm.name : fm[f];
    if (v !== undefined && v !== null && String(v).trim() !== '') dataFm[f] = v;
  }
  const rows = compareFields(dataFm, sourceFields).filter((r) => r.status !== 'empty');
  console.log(
    `[抽查] ${spec}  GameKee页「${leaf.name}」 content_id=${leaf.content_id}  data: ${path.relative(ROOT, existingPath)}`,
  );
  console.log(`  ${pad('字段', 14)}${pad('data', 18)}${pad('GameKee', 18)}状态`);
  for (const r of rows) {
    console.log(`  ${pad(r.field, 14)}${pad(r.data, 18)}${pad(r.source, 18)}${STATUS_LABEL[r.status] || r.status}`);
  }
  const diffs = rows.filter((r) => r.status === 'diff').length;
  console.log(`  合计 ${rows.length} 项，差异 ${diffs} 项\n`);
  return { count: rows.length, diffs, missing: 0 };
}

async function runTree(src) {
  const tree = await src.getEntryList();
  const walk = (nodes, depth) => {
    for (const n of nodes || []) {
      if (depth > 1) continue;
      console.log(`${'  '.repeat(depth)}${n.id}  ${n.name}${n.child ? ` (${n.child.length})` : ''}`);
      if (n.child) walk(n.child, depth + 1);
    }
  };
  walk(tree, 0);
}

async function runPosts(src, entryId) {
  const posts = await src.getPageList({ entryId, pageSize: 5 });
  console.log(`[攻略流] entry_id=${entryId} 最新 ${posts.length} 条:`);
  for (const p of posts) console.log(`  ${p.id}  ${p.title}  (view=${p.view_count}, updated=${p.updated_at})`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const checks = String(args.check || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const doTree = Boolean(args.tree);
  const posts = args.posts !== undefined ? String(args.posts) : null;
  if (!checks.length && !doTree && posts === null) {
    console.log('用法: node scripts/crawl-gamekee.js [--check <目标:名字>[,...]] [--tree] [--posts <entry_id>]');
    console.log('  --check: zzz-agent | zzz-sound-engine（字段抽查比对，不落盘）');
    console.log('  --tree: 打印栏目树（entry/list.json）');
    console.log('  --posts: 打印某条目的攻略帖子流（content/pageList）');
    console.log('  示例: node scripts/crawl-gamekee.js --check zzz-agent:安比');
    process.exit(1);
  }

  const fetcher = createFetcher({ rateLimitMs: 1000, backoffMs: 30000, proxy: process.env.http_proxy || null });
  const src = createGameKeeSource(fetcher);

  const summary = { count: 0, diffs: 0, missing: 0 };
  for (const spec of checks) {
    const r = await runCheck(src, spec);
    summary.count += r.count;
    summary.diffs += r.diffs;
    summary.missing += r.missing;
  }
  if (doTree) await runTree(src);
  if (posts !== null) await runPosts(src, Number(posts));

  if (summary.missing > 0) {
    console.log(`抽查有 ${summary.missing} 个目标未通过`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});

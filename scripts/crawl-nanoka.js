import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFetcher } from './crawler/fetcher.js';
import {
  createNanokaSource,
  parseCurrencyRole,
  parseCurrencyTrait,
  parseCurrencyItem,
  parseCurrencyAugment,
  parseCurrencyBuff,
  renderCurrencyDesc,
  normDesc,
  parseZzzMonster,
  parseZzzBoss,
  parseHsrSkillTables,
  renderHsrSkillParams,
  parseZzzSkillSource,
  parseZzzAgentSkill,
  zzzSkillValueAt,
} from './crawler/sources/nanoka.js';
import { compareFields, STATUS_LABEL, pad } from './crawler/compare.js';
import { findExistingFile, readEntityFile, normalizeName } from './crawler/writer.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_ROOT = path.join(ROOT, 'data');

const TARGET_LABEL = 'nanoka';

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

function pickFm(fields, fm) {
  const dataFm = {};
  for (const f of fields) {
    const v = fm[f];
    if (v !== undefined && v !== null && String(v).trim() !== '') dataFm[f] = v;
  }
  return dataFm;
}

function printRows(spec, header, dataFm, sourceFields, rel) {
  const rows = compareFields(dataFm, sourceFields).filter((r) => r.status !== 'empty');
  console.log(`[抽查] ${spec}  ${header}  data: ${rel}`);
  console.log(`  ${pad('字段', 22)}${pad('data', 26)}${pad(TARGET_LABEL, 26)}状态`);
  for (const r of rows) {
    console.log(`  ${pad(r.field, 22)}${pad(r.data, 26)}${pad(r.source, 26)}${STATUS_LABEL[r.status] || r.status}`);
  }
  const diffs = rows.filter((r) => r.status === 'diff').length;
  console.log(`  合计 ${rows.length} 项，差异 ${diffs} 项\n`);
  return { count: rows.length, diffs, missing: 0 };
}

function findCurrencyFile(sub, sel) {
  for (const season of ['season1', 'season2']) {
    const dir = path.join(DATA_ROOT, 'currency', season, sub);
    if (!fs.existsSync(dir)) continue;
    let file = null;
    if (/^\d+$/.test(sel)) {
      const hit = fs.readdirSync(dir).find((f) => f.startsWith(`${sel}_`) && f.endsWith('.md'));
      if (hit) file = hit;
    } else {
      const p = findExistingFile(dir, [sel]);
      if (p) file = path.basename(p);
    }
    if (file) return { path: path.join(dir, file), id: path.basename(file).split('_')[0], season };
  }
  return null;
}

function readCategoryRows(season, category) {
  const dir = path.join(DATA_ROOT, 'currency', season, category);
  if (!fs.existsSync(dir)) return [];
  const file = fs.readdirSync(dir).find((f) => f.endsWith('.md') && f !== '_index.md');
  if (!file) return [];
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 4) continue;
    if (cells[1] === '#' || /^-*$/.test(cells[1] || '')) continue;
    rows.push({ cells, season, file: path.join(dir, file) });
  }
  return rows;
}

function findEnemyFile(sel) {
  const dir = path.join(DATA_ROOT, 'zzz', 'enemies');
  if (!fs.existsSync(dir)) return null;
  if (/^\d+$/.test(sel)) {
    const hit = fs.readdirSync(dir).find((f) => f.startsWith(`${sel}_`) && f.endsWith('.md'));
    if (hit) return { path: path.join(dir, hit), id: path.basename(hit).split('_')[0] };
    return null;
  }
  const target = normalizeName(sel);
  const hit = fs
    .readdirSync(dir)
    .find((f) => f.endsWith('.md') && normalizeName(path.basename(f, '.md').replace(/^\d+_/, '')) === target);
  if (hit) return { path: path.join(dir, hit), id: path.basename(hit).split('_')[0] };
  const p = findExistingFile(dir, [sel]);
  if (p) return { path: p, id: path.basename(p).split('_')[0] };
  return null;
}

function missing(spec, why) {
  console.log(`[抽查] ${spec} → ${why}\n`);
  return { count: 0, diffs: 0, missing: 1 };
}

async function runCheckRole(src, spec, sel) {
  const found = findCurrencyFile('roles', sel);
  if (!found) return missing(spec, 'data 中未找到对应角色文件');
  const roles = await src.list('hsr', 'zh/currency/role.json');
  const traits = await src.list('hsr', 'zh/currency/trait.json');
  const entry = roles[found.id];
  if (!entry) return missing(spec, `nanoka role.json 中无 id=${found.id}`);
  const { fm } = readEntityFile(found.path);
  const sourceFields = parseCurrencyRole(entry, traits);
  const dataFm = pickFm(['id', 'name', '星阶', '星级', '站位', '治疗护盾', '特性'], fm);
  return printRows(spec, `货币战争角色 id=${found.id}（${found.season}）`, dataFm, sourceFields, path.relative(ROOT, found.path));
}

async function runCheckTrait(src, spec, sel) {
  const found = findCurrencyFile('traits', sel);
  if (!found) return missing(spec, 'data 中未找到对应羁绊文件');
  const traits = await src.list('hsr', 'zh/currency/trait.json');
  const entry = traits[found.id];
  if (!entry) return missing(spec, `nanoka trait.json 中无 id=${found.id}`);
  const { fm } = readEntityFile(found.path);
  const sourceFields = parseCurrencyTrait(entry);
  const dataFm = pickFm(['id', 'name'], fm);
  return printRows(spec, `货币战争羁绊 id=${found.id}（${found.season}）`, dataFm, sourceFields, path.relative(ROOT, found.path));
}

async function runCheckItem(src, spec, sel) {
  const rows = [...readCategoryRows('season1', 'items'), ...readCategoryRows('season2', 'items')];
  const numeric = /^\d+$/.test(sel);
  const hit = rows.find((r) => (numeric ? r.cells[2] === sel : r.cells[3] === sel));
  if (!hit) return missing(spec, 'data 物品总表中未找到对应条目');
  const items = await src.list('hsr', 'zh/currency/item.json');
  const entry = items[hit.cells[2]];
  if (!entry) return missing(spec, `nanoka item.json 中无 id=${hit.cells[2]}`);
  const dataFm = { 名称: hit.cells[3], 类型: hit.cells[5], 描述: normDesc(hit.cells[7]) };
  const sourceFields = parseCurrencyItem(entry);
  return printRows(spec, `货币战争物品 id=${hit.cells[2]}（${hit.season}）`, dataFm, sourceFields, path.relative(ROOT, hit.file));
}

async function runCheckAugment(src, spec, sel) {
  const rows = [...readCategoryRows('season1', 'strategies'), ...readCategoryRows('season2', 'strategies')];
  const all = await src.list('hsr', 'zh/currency/augment.json');
  const numeric = /^\d+$/.test(sel);
  let entry = null;
  let row = null;
  let note = '';
  if (numeric) {
    entry = all[sel];
    if (!entry) return missing(spec, `nanoka augment.json 中无 id=${sel}`);
    row = rows.find((r) => r.cells[2] === entry.name);
    if (!row) return missing(spec, 'data 投资策略总表中未找到对应名称');
  } else {
    const matches = rows.filter((r) => r.cells[2] === sel);
    if (!matches.length) return missing(spec, 'data 投资策略总表中未找到对应条目');
    const candidates = Object.values(all).filter((e) => e.name === sel);
    if (!candidates.length) return missing(spec, `nanoka augment.json 中无「${sel}」`);
    if (candidates.length === 1) {
      entry = candidates[0];
      row = matches[0];
    } else {
      const byDesc = matches
        .map((r) => ({ r, e: candidates.find((c) => renderCurrencyDesc(c.desc, c.param_list) === r.cells[4]) }))
        .find((x) => x.e);
      entry = byDesc ? byDesc.e : candidates[0];
      row = byDesc ? byDesc.r : matches[0];
      if (!byDesc) note = `同名 ${candidates.length} 条，取首个`;
    }
  }
  const dataFm = { 名称: row.cells[2], 品质: row.cells[3], 说明: normDesc(row.cells[4]) };
  const sourceFields = parseCurrencyAugment(entry);
  const rel = path.relative(ROOT, row.file);
  const out = printRows(spec, `投资策略 id=${entry.id}（${row.season}）${note ? ` ${note}` : ''}`, dataFm, sourceFields, rel);
  return out;
}

async function runCheckBuff(src, spec, sel) {
  const rows = [...readCategoryRows('season1', 'environments'), ...readCategoryRows('season2', 'environments')];
  const all = await src.list('hsr', 'zh/currency/buff.json');
  const numeric = /^\d+$/.test(sel);
  let entry = null;
  let row = null;
  let note = '';
  if (numeric) {
    entry = all[sel];
    if (!entry) return missing(spec, `nanoka buff.json 中无 id=${sel}`);
    row = rows.find((r) => r.cells[2] === entry.name);
    if (!row) return missing(spec, 'data 投资环境总表中未找到对应名称');
  } else {
    const matches = rows.filter((r) => r.cells[2] === sel);
    if (!matches.length) return missing(spec, 'data 投资环境总表中未找到对应条目');
    const candidates = Object.values(all).filter((e) => e.name === sel);
    if (!candidates.length) return missing(spec, `nanoka buff.json 中无「${sel}」`);
    if (candidates.length === 1) {
      entry = candidates[0];
      row = matches[0];
    } else {
      entry = candidates[0];
      row = matches[0];
      note = `同名 ${candidates.length} 条，取首个`;
    }
  }
  const dataFm = { 名称: row.cells[2], 说明: normDesc(row.cells[3]) };
  if (row.cells[4]) dataFm['关联'] = row.cells[4];
  const sourceFields = parseCurrencyBuff(entry);
  return printRows(spec, `投资环境 id=${entry.id}（${row.season}）${note ? ` ${note}` : ''}`, dataFm, sourceFields, path.relative(ROOT, row.file));
}

async function runCheckMonster(src, spec, sel) {
  let id = null;
  if (/^\d+$/.test(sel)) {
    id = sel;
  } else {
    const list = await src.list('zzz', 'monster.json');
    const hit = Object.entries(list).find(([, e]) => e.zh === sel);
    if (hit) id = hit[0];
  }
  if (!id) return missing(spec, 'nanoka monster.json 中未找到对应名称');
  const found = findEnemyFile(id);
  if (!found) return missing(spec, `data 中未找到 id=${found ? found.id : id} 的文件`);
  const detail = await src.detail('zzz', 'monster', id);
  const { fm } = readEntityFile(found.path);
  const sourceFields = parseZzzMonster(detail);
  const dataFm = pickFm(['id', 'name', '阵营', '评级', '弱点', '生命值', '攻击力', '防御力', '冲击力'], fm);
  return printRows(spec, `ZZZ 怪物 id=${id}`, dataFm, sourceFields, path.relative(ROOT, found.path));
}

async function runCheckBoss(src, spec, sel) {
  let id = null;
  if (/^\d+$/.test(sel)) {
    id = sel;
  } else {
    const list = await src.list('zzz', 'boss.json');
    const hit = Object.entries(list).find(([, e]) => e.zh === sel);
    if (hit) id = hit[0];
  }
  if (!id) return missing(spec, 'nanoka boss.json 中未找到对应名称');
  const found = findEnemyFile(id);
  if (!found) return missing(spec, `data 中未找到 id=${id} 的文件`);
  const list = await src.list('zzz', 'boss.json');
  const { fm, body } = readEntityFile(found.path);
  const sourceFields = parseZzzBoss(list[id], id);
  const dataFm = pickFm(['id', 'name'], fm);
  const m = /(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) ~ (\d{4}-\d{2}-\d{2})/.exec(body);
  if (m) {
    dataFm['开始'] = m[1];
    dataFm['结束'] = m[2];
  }
  return printRows(spec, `ZZZ Boss id=${id}`, dataFm, sourceFields, path.relative(ROOT, found.path));
}

async function runCheckHsrSkill(src, spec, sel) {
  const p = findExistingFile(path.join(DATA_ROOT, 'hsr', 'characters'), [sel]);
  if (!p) return missing(spec, 'data 中未找到对应角色文件');
  const id = path.basename(p).split('_')[0];
  const detail = await src.detail('hsr', 'character', id);
  const { body } = readEntityFile(p);
  const tables = parseHsrSkillTables(body);
  const byName = new Map(Object.values(detail.skills || {}).map((s) => [s.name, s]));
  const dataFm = {};
  const sourceFields = {};
  for (const t of Object.values(tables)) {
    const sk = byName.get(t.name);
    if (!sk || !t.levels.length) continue;
    for (const lv of t.levels) {
      const rendered = renderHsrSkillParams(sk, String(lv.level));
      if (!rendered.length || !lv.cells[0]) continue;
      const key = `${t.type}等级${lv.level}数值1`;
      dataFm[key] = lv.cells[0];
      sourceFields[key] = floorPct(rendered[0]);
    }
  }
  if (!Object.keys(dataFm).length) return missing(spec, '行迹表与 nanoka 技能无交集');
  return printRows(spec, `HSR 角色技能 id=${id}（数值1列全等级，源按米游社整数口径 floor；数值2与最高等级为来源口径差不比对）`, dataFm, sourceFields, path.relative(ROOT, p));
}

function zPct(v) {
  if (v === null || v === undefined) return '';
  return `${Math.round((v / 100) * 100) / 100}%`;
}

function floorPct(s) {
  const m = /^(\d+(?:\.\d+)?)%$/.exec(String(s));
  if (!m) return s;
  return `${Math.floor(Number(m[1]))}%`;
}

async function runCheckZzzSkill(src, spec, sel) {
  const p = findExistingFile(path.join(DATA_ROOT, 'zzz', 'agents'), [sel]);
  if (!p) return missing(spec, 'data 中未找到对应代理人文件');
  const id = path.basename(p).split('_')[0];
  const detail = await src.detail('zzz', 'character', id);
  const { body } = readEntityFile(p);
  const dataSkill = parseZzzAgentSkill(body);
  const srcSkill = parseZzzSkillSource(detail);
  if (!dataSkill || !srcSkill) return missing(spec, '技能表解析失败');
  const dataFm = {};
  const sourceFields = {};
  const put = (key, dataV, sourceV) => {
    if (dataV) {
      dataFm[key] = dataV;
      sourceFields[key] = sourceV;
    }
  };
  put('普攻Lv1一段伤害倍率', dataSkill.lv1, zPct(zzzSkillValueAt(srcSkill.damage, srcSkill.damageGrowth, 1)));
  put('普攻Lv2一段伤害倍率', dataSkill.lv2, zPct(zzzSkillValueAt(srcSkill.damage, srcSkill.damageGrowth, 2)));
  put(`普攻Lv${dataSkill.max}一段伤害倍率`, dataSkill.lvLast, zPct(zzzSkillValueAt(srcSkill.damage, srcSkill.damageGrowth, dataSkill.max)));
  put('普攻Lv1一段失衡倍率', dataSkill.stunLv1, zPct(zzzSkillValueAt(srcSkill.stun, srcSkill.stunGrowth, 1)));
  if (!Object.keys(dataFm).length) return missing(spec, '技能数值行解析失败');
  return printRows(spec, `ZZZ 代理人技能 id=${id}（${srcSkill.name}）`, dataFm, sourceFields, path.relative(ROOT, p));
}

const RUNNERS = {
  role: runCheckRole,
  trait: runCheckTrait,
  item: runCheckItem,
  augment: runCheckAugment,
  buff: runCheckBuff,
  monster: runCheckMonster,
  boss: runCheckBoss,
  'hsr-skill': runCheckHsrSkill,
  'zzz-skill': runCheckZzzSkill,
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const checks = String(args.check || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const showVersions = Boolean(args.versions);
  if (!checks.length && !showVersions) {
    console.log('用法: node scripts/crawl-nanoka.js [--check <目标:选择器>[,...]] [--versions]');
    console.log('  --check 目标: role | trait | item | augment | buff | monster | boss | hsr-skill | zzz-skill');
    console.log('  选择器可用名字或数字 ID（角色/羁绊/怪物/Boss/技能按 data 文件解析）');
    console.log('  --versions: 输出两站当前数据版本');
    console.log('  示例: node scripts/crawl-nanoka.js --check role:三月七,monster:提尔锋,zzz-skill:安比');
    process.exit(1);
  }

  const fetcher = createFetcher({ rateLimitMs: 800, backoffMs: 30000, proxy: process.env.http_proxy || null });
  const src = createNanokaSource(fetcher);

  if (showVersions) {
    const hsr = await src.version('hsr');
    const zzz = await src.version('zzz');
    console.log(`hsr.nanoka.cc = ${hsr}`);
    console.log(`zzz.nanoka.cc = ${zzz}`);
  }

  const summary = { count: 0, diffs: 0, missing: 0 };
  for (const spec of checks) {
    const [tname, sel] = splitSpec(spec);
    const runner = RUNNERS[tname];
    if (!runner) throw new Error(`未知抽查目标 ${tname}（可用: ${Object.keys(RUNNERS).join(' | ')}）`);
    if (!sel) throw new Error(`--check ${tname} 需要 :名字 选择器`);
    const r = await runner(src, spec, sel);
    summary.count += r.count;
    summary.diffs += r.diffs;
    summary.missing += r.missing;
  }

  if (summary.missing > 0) console.log(`抽查有 ${summary.missing} 个目标未通过`);
  process.exit(summary.missing > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});

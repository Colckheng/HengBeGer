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
import { findExistingFile, readEntityFile, normalizeName, renderDoc, writeEntityFile, validateRendered, touchState } from './crawler/writer.js';
import { snapshot, diffSnapshots } from './crawler/diff.js';
import { buildReport } from './crawler/report.js';
import {
  sourceUrl,
  readSeasonRows,
  sectionText,
  stripCrawlTime,
  assignItems,
  assignByName,
  buildEntryDoc,
  refreshEntryFm,
  findEntrySeason,
  entryFilename,
  categoryConfig,
} from './crawler/currency-writer.js';
import { enemySourceUrl, refreshEnemyFm, syncBossBodyDates } from './crawler/enemy-writer.js';

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
  const found = findCurrencyFile('items', sel);
  if (!found) return missing(spec, 'data 中未找到对应物品文件');
  const items = await src.list('hsr', 'zh/currency/item.json');
  const entry = items[found.id];
  if (!entry) return missing(spec, `nanoka item.json 中无 id=${found.id}`);
  const { fm, body } = readEntityFile(found.path);
  const dataFm = { 名称: fm.name, 类型: fm.类型, 描述: sectionText(body, '效果') || '-' };
  const sourceFields = parseCurrencyItem(entry);
  return printRows(spec, `货币战争物品 id=${found.id}（${found.season}）`, dataFm, sourceFields, path.relative(ROOT, found.path));
}

async function runCheckAugment(src, spec, sel) {
  const found = findCurrencyFile('strategies', sel);
  if (!found) return missing(spec, 'data 中未找到对应投资策略文件');
  const all = await src.list('hsr', 'zh/currency/augment.json');
  const entry = all[found.id];
  if (!entry) return missing(spec, `nanoka augment.json 中无 id=${found.id}`);
  const { fm, body } = readEntityFile(found.path);
  const srcF = parseCurrencyAugment(entry);
  const dataFm = { 名称: fm.name, 类型: fm.类型, 说明: sectionText(body, '说明') };
  const sourceFields = { 名称: srcF.名称, 类型: srcF.品质, 说明: normDesc(srcF.说明) };
  return printRows(spec, `投资策略 id=${found.id}（${found.season}）`, dataFm, sourceFields, path.relative(ROOT, found.path));
}

async function runCheckBuff(src, spec, sel) {
  const found = findCurrencyFile('environments', sel);
  if (!found) return missing(spec, 'data 中未找到对应投资环境文件');
  const all = await src.list('hsr', 'zh/currency/buff.json');
  const entry = all[found.id];
  if (!entry) return missing(spec, `nanoka buff.json 中无 id=${found.id}`);
  const { fm, body } = readEntityFile(found.path);
  const srcF = parseCurrencyBuff(entry);
  const dataFm = { 名称: fm.name, 说明: sectionText(body, '说明') };
  if (fm['关联']) dataFm['关联'] = fm['关联'];
  const sourceFields = { 名称: srcF.名称, 说明: normDesc(srcF.说明) };
  if (srcF['关联']) sourceFields['关联'] = srcF['关联'];
  return printRows(spec, `投资环境 id=${found.id}（${found.season}）`, dataFm, sourceFields, path.relative(ROOT, found.path));
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

const CURRENCY_CLASSES = ['role', 'trait', 'item', 'strategy', 'environment'];
const WRITE_CLASSES = [...CURRENCY_CLASSES, 'monster', 'boss'];
const CAT_JSON = { item: 'item.json', strategy: 'augment.json', environment: 'buff.json' };

function listMdFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md') && f !== '_index.md');
}

function pushOp(ctx, dir, filename, fm, text, raw) {
  if (raw !== undefined && stripCrawlTime(text) === stripCrawlTime(raw)) return false;
  ctx.ops.push({ dir, filename, fm, text, rel: path.relative(ROOT, path.join(dir, filename)) });
  ctx.dirs.add(dir);
  return true;
}

function writeRoleTrait(ctx, sub, source, parser) {
  const json = sub === 'roles' ? 'role.json' : 'trait.json';
  for (const entry of Object.values(source)) {
    const found = findCurrencyFile(sub, String(entry.id));
    if (!found) {
      ctx.anomalies.push(`${sub}: 源条目在 data 中无文件 id=${entry.id} ${entry.name}`);
      continue;
    }
    const { fm, body, raw } = readEntityFile(found.path);
    const fields = parser(entry);
    if (!fields.name && fm.name) delete fields.name;
    if (!fields.id && fm.id !== undefined) delete fields.id;
    const merged = {
      ...fm,
      ...fields,
      source: 'nanoka',
      source_url: sourceUrl(ctx.version, json),
      version: ctx.version,
      last_crawled_at: ctx.now,
    };
    pushOp(ctx, path.dirname(found.path), path.basename(found.path), merged, renderDoc(merged, [], body), raw);
  }
}

function writeCategory(ctx, category) {
  const cfg = categoryConfig(category);
  const source = ctx.lists[CAT_JSON[category]];
  const seasonRows = readSeasonRows(DATA_ROOT, category);
  const hadTable = seasonRows.length > 0;
  let assign = new Map();
  if (hadTable) {
    const res =
      category === 'item'
        ? assignItems(seasonRows, source)
        : assignByName(seasonRows, source, {
            category,
            nameIdx: 2,
            descIdx: category === 'strategy' ? 4 : 3,
            renderDesc: (e) => renderCurrencyDesc(e.desc, e.param_list),
          });
    if (res.anomalies.length) {
      ctx.anomalies.push(...res.anomalies);
      console.log(`[拆条目] ${cfg.dir}: 匹配异常，跳过该类（保留总表）`);
      return;
    }
    assign = res.assign;
    const rows = seasonRows.reduce((n, s) => n + s.rows.length, 0);
    console.log(`[拆条目] ${cfg.dir}: 总表 ${rows} 行 → 单条文件（源 ${Object.keys(source).length} 条）`);
  }
  for (const [id, entry] of Object.entries(source)) {
    const located = findEntrySeason(DATA_ROOT, category, id);
    const a = assign.get(id);
    const season = (located && located.season) || (a && a.season);
    if (!season) {
      ctx.anomalies.push(`${category}: 源条目无赛季归属 id=${id} ${entry.name}`);
      continue;
    }
    const dir = path.join(DATA_ROOT, 'currency', season, cfg.dir);
    if (located) {
      const { fm, body, raw } = readEntityFile(located.file);
      const merged = refreshEntryFm(category, { id, entry, season, existingFm: fm, version: ctx.version, now: ctx.now });
      pushOp(ctx, dir, path.basename(located.file), merged, renderDoc(merged, [], body), raw);
    } else {
      const built = buildEntryDoc(category, {
        id,
        entry,
        season,
        seedCells: a ? a.cells : null,
        version: ctx.version,
        now: ctx.now,
      });
      pushOp(ctx, dir, entryFilename(id, entry.name), built.fm, built.text);
    }
  }
  if (hadTable) {
    for (const s of seasonRows) {
      ctx.tableDeletes.push(s.file);
      ctx.dirs.add(path.dirname(s.file));
    }
  }
}

async function writeEnemies(ctx, src, kinds) {
  const dir = path.join(DATA_ROOT, 'zzz', 'enemies');
  const ver = ctx.zzzVersion;
  const monsterList = kinds.has('monster') ? await src.list('zzz', 'monster.json') : null;
  const bossList = kinds.has('boss') ? await src.list('zzz', 'boss.json') : null;
  if (kinds.has('monster')) {
    for (const id of Object.keys(monsterList)) {
      const found = findEnemyFile(id);
      if (!found) {
        ctx.anomalies.push(`monster: 源条目在 data 中无文件 id=${id} ${monsterList[id].zh || ''}`);
        continue;
      }
      const detail = await src.detail('zzz', 'monster', id);
      const fields = parseZzzMonster(detail) || {};
      const { fm, body, raw } = readEntityFile(found.path);
      const merged = refreshEnemyFm({
        existingFm: fm,
        fields,
        sourceUrl: enemySourceUrl(ver, `zh/monster/${id}.json`),
        version: ver,
        now: ctx.now,
      });
      pushOp(ctx, dir, path.basename(found.path), merged, renderDoc(merged, [], body), raw);
    }
  }
  if (kinds.has('boss')) {
    for (const id of Object.keys(bossList)) {
      const found = findEnemyFile(id);
      if (!found) {
        ctx.anomalies.push(`boss: 源条目在 data 中无文件 id=${id} ${bossList[id].zh || ''}`);
        continue;
      }
      const parsed = parseZzzBoss(bossList[id], id);
      const { fm, body, raw } = readEntityFile(found.path);
      const merged = refreshEnemyFm({
        existingFm: fm,
        fields: { name: parsed.name },
        sourceUrl: enemySourceUrl(ver, 'boss.json'),
        version: ver,
        now: ctx.now,
      });
      pushOp(ctx, dir, path.basename(found.path), merged, renderDoc(merged, [], syncBossBodyDates(body, parsed)), raw);
    }
  }
  if (monsterList && bossList) {
    const srcIds = new Set([...Object.keys(monsterList), ...Object.keys(bossList)]);
    for (const f of listMdFiles(dir)) {
      const id = path.basename(f).split('_')[0];
      if (/^\d+$/.test(id) && !srcIds.has(id)) ctx.anomalies.push(`enemies: data 文件在源中已不存在 id=${id} ${f}`);
    }
  }
}

async function runWrite(src, args) {
  const only = String(args.only || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const selected = only.length ? only : WRITE_CLASSES;
  const unknown = selected.filter((c) => !WRITE_CLASSES.includes(c));
  if (unknown.length) throw new Error(`--only 含未知类别: ${unknown.join(',')}（可用: ${WRITE_CLASSES.join(',')}）`);
  const now = new Date().toISOString();
  const ctx = { version: null, now, anomalies: [], ops: [], dirs: new Set(), tableDeletes: [], lists: {}, zzzVersion: null };
  if (selected.some((c) => CURRENCY_CLASSES.includes(c))) ctx.version = await src.version('hsr');
  const enemyKinds = new Set(selected.filter((c) => c === 'monster' || c === 'boss'));
  if (enemyKinds.size) ctx.zzzVersion = await src.version('zzz');
  const before = snapshot(DATA_ROOT);

  if (ctx.version && (selected.includes('role') || selected.includes('trait'))) {
    ctx.lists['role.json'] = await src.list('hsr', 'zh/currency/role.json');
    ctx.lists['trait.json'] = await src.list('hsr', 'zh/currency/trait.json');
  }
  for (const [cat, json] of Object.entries(CAT_JSON)) {
    if (selected.includes(cat)) ctx.lists[json] = await src.list('hsr', `zh/currency/${json}`);
  }
  if (selected.includes('role')) {
    writeRoleTrait(ctx, 'roles', ctx.lists['role.json'], (e) => parseCurrencyRole(e, ctx.lists['trait.json']));
  }
  if (selected.includes('trait')) writeRoleTrait(ctx, 'traits', ctx.lists['trait.json'], parseCurrencyTrait);
  for (const cat of ['item', 'strategy', 'environment']) {
    if (selected.includes(cat)) writeCategory(ctx, cat);
  }
  if (enemyKinds.size) await writeEnemies(ctx, src, enemyKinds);

  let bad = 0;
  let warn = 0;
  for (const op of ctx.ops) {
    const v = validateRendered(op.text);
    if (v.errors.length) {
      bad += 1;
      console.log(`[校验错误] ${op.rel}: ${v.errors.join('; ')}`);
    }
    warn += v.warnings.length;
  }
  if (bad) {
    console.log(`校验失败（${bad} 个文件有错误），未写入`);
    return 2;
  }
  for (const op of ctx.ops) writeEntityFile(op.dir, op.filename, op.fm, op.text);
  for (const f of ctx.tableDeletes) fs.rmSync(f);
  for (const d of ctx.dirs) {
    const md = listMdFiles(d).length;
    touchState(d, { primary_source: 'nanoka', counts: { files: md, indexed: md } });
  }
  const after = snapshot(DATA_ROOT);
  const diff = diffSnapshots(before, after);
  if (ctx.anomalies.length) {
    console.log('异常:');
    for (const a of ctx.anomalies) console.log(`  - ${a}`);
  }
  if (!diff.added.length && !diff.modified.length && !diff.deleted.length) {
    console.log(`无变更（data/ 与源一致）${warn ? `，${warn} 个警告` : ''}`);
    return ctx.anomalies.length ? 1 : 0;
  }
  const report = buildReport(ROOT, { diff, snapshotBefore: before, snapshotAfter: after, anomalies: ctx.anomalies });
  console.log(`\n已写入 ${ctx.ops.length} 个文件，删除总表 ${ctx.tableDeletes.length} 个${warn ? `（${warn} 个警告）` : ''}`);
  console.log(`报告: ${report && report.id ? report.id : path.join(ROOT, 'reports', '*.md')}`);
  console.log(`确认后执行: npm run sync -- --report ${report ? report.id : '<报告id>'}`);
  return ctx.anomalies.length ? 1 : 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const checks = String(args.check || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const showVersions = Boolean(args.versions);
  const doWrite = Boolean(args.write);
  if (!checks.length && !showVersions && !doWrite) {
    console.log('用法: node scripts/crawl-nanoka.js [--check <目标:选择器>[,...]] [--versions] [--write [--only 类别,...]]');
    console.log('  --check 目标: role | trait | item | augment | buff | monster | boss | hsr-skill | zzz-skill');
    console.log('  选择器可用名字或数字 ID（角色/羁绊/怪物/Boss/技能按 data 文件解析）');
    console.log('  --versions: 输出两站当前数据版本');
    console.log('  --write: 拉取货币战争五类 + ZZZ 怪物/Boss 写回 data/ 并生成报告（items/strategies/environments 首次自动拆条目）');
    console.log('  --only: role | trait | item | strategy | environment | monster | boss（默认全部）');
    console.log('  示例: node scripts/crawl-nanoka.js --check role:三月七,monster:提尔锋,zzz-skill:安比');
    process.exit(1);
  }

  const fetcher = createFetcher({ rateLimitMs: 800, backoffMs: 30000, proxy: process.env.http_proxy || null });
  const src = createNanokaSource(fetcher);

  if (doWrite) {
    process.exit(await runWrite(src, args));
  }

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

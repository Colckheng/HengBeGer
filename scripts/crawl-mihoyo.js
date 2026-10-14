import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFetcher } from './crawler/fetcher.js';
import { createMihoyoSource, CHANNELS } from './crawler/sources/mihoyo.js';
import { transformZzzCharacter } from './crawler/transformers/zzz-character.js';
import { transformHsrCharacter } from './crawler/transformers/hsr-character.js';
import { transformGacha } from './crawler/transformers/gacha.js';
import { transformHsrLightcone } from './crawler/transformers/hsr-lightcone.js';
import { transformHsrRelic } from './crawler/transformers/hsr-relic.js';
import { transformZzzWeapon } from './crawler/transformers/zzz-weapon.js';
import { transformZzzEquipment } from './crawler/transformers/zzz-equipment.js';
import { transformZzzBangboo } from './crawler/transformers/zzz-bangboo.js';
import {
  renderDoc,
  mergeBodies,
  mergeFm,
  findExistingFile,
  writeEntityFile,
  readEntityFile,
  validateRendered,
  touchState,
  sanitizeFilename,
  normalizeName,
  isUnchangedText,
} from './crawler/writer.js';
import { snapshot, diffSnapshots } from './crawler/diff.js';
import { buildReport } from './crawler/report.js';
import { resolveBatchDir } from './crawler/batch-assign.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_ROOT = path.join(ROOT, 'data');

const TARGETS = {
  'zzz-agent': { game: 'zzz', dir: ['zzz', 'agents'], channel: CHANNELS['zzz/character'], transform: 'zzz' },
  'hsr-character': { game: 'hsr', dir: ['hsr', 'characters'], channel: CHANNELS['hsr/character'], transform: 'hsr' },
  'zzz-weapon': { game: 'zzz', dir: ['zzz', 'sound_engines'], channel: CHANNELS['zzz/weapon'], transform: 'zzz-weapon' },
  'zzz-equipment': { game: 'zzz', dir: ['zzz', 'drive_disks'], channel: CHANNELS['zzz/equipment'], transform: 'zzz-equipment' },
  'zzz-bangboo': { game: 'zzz', dir: ['zzz', 'bangboo'], channel: CHANNELS['zzz/bangboo'], transform: 'zzz-bangboo' },
  'hsr-lightcone': { game: 'hsr', dir: ['hsr', 'light_cones'], channel: CHANNELS['hsr/lightcone'], transform: 'hsr-lightcone' },
  'hsr-relic': { game: 'hsr', dir: ['hsr', 'relics'], channel: CHANNELS['hsr/relic'], transform: 'hsr-relic' },
  gacha: { transform: 'gacha' },
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

function buildPreamble(fm) {
  const title = `# ${fm.name}`;
  if (fm.type === 'gacha') {
    const span = [fm.start_time, fm.end_time].filter(Boolean).join(' ~ ');
    return span ? `${title}\n\n**${span}**` : title;
  }
  const dims = [fm.特性, fm.属性, fm.命途].filter(Boolean).join(' · ');
  const stars = fm.星级 ? '★'.repeat(Number(fm.星级)) : '';
  const tail = [fm.评级, stars].filter(Boolean).join(' ');
  const sub = [dims, tail].filter(Boolean).join(' · ');
  return sub ? `${title}\n\n**${sub}**` : title;
}

function pickListItem(items, { id, name }) {
  if (id !== undefined && id !== null && String(id).length) {
    return items.find((i) => String(i.content_id) === String(id)) || null;
  }
  if (name) {
    const n = normalizeName(name);
    const exact = items.filter((i) => normalizeName(i.title) === n || normalizeName(i.alias) === n);
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) throw new Error(`名字「${name}」匹配到多个条目: ${exact.map((x) => x.title).join(', ')}`);
    const prefix = items.filter((i) => normalizeName(i.title).startsWith(n) || normalizeName(i.alias).startsWith(n));
    if (prefix.length === 1) return prefix[0];
    if (prefix.length > 1) throw new Error(`名字「${name}」前缀匹配到多个条目: ${prefix.map((x) => x.title).join(', ')}`);
    throw new Error(`米游社列表中找不到「${name}」`);
  }
  return null;
}

function findExistingByTitleOrId(dir, names, contentId) {
  const hit = findExistingFile(dir, names.filter(Boolean));
  if (hit) return hit;
  if (contentId && fs.existsSync(dir)) {
    const f = fs.readdirSync(dir).find((x) => x.startsWith(`${contentId}_`) && x.endsWith('.md'));
    if (f) return path.join(dir, f);
  }
  return null;
}

async function crawlOne(src, target, item, opts = {}) {
  const dir = path.join(DATA_ROOT, ...target.dir);
  const contentId = (item && item.content_id) || opts.contentId;
  const existingPath =
    opts.existingPath !== undefined
      ? opts.existingPath
      : findExistingByTitleOrId(dir, [item && item.title, item && item.alias, opts.selectorName].filter(Boolean), contentId);
  const existing = existingPath ? readEntityFile(existingPath) : null;
  if (!existing && opts.batch) return null;
  const localId = (existing && existing.fm && existing.fm.id) || contentId;
  let page;
  let fm, sections, sourceWarnings = [];
  if (target.transform === 'zzz') {
    page = await src.getZzzEntry(contentId);
    const { fm: f, sections: s } = transformZzzCharacter({ page, listItem: item, localId, existing: existing && existing.fm });
    fm = f; sections = s;
  } else if (target.transform === 'hsr') {
    page = await src.getHsrContent(contentId);
    const { fm: f, sections: s } = transformHsrCharacter({ content: page, listItem: item, localId, existing: existing && existing.fm });
    fm = f; sections = s;
  } else if (target.transform === 'zzz-weapon') {
    page = await src.getZzzEntry(contentId);
    const { fm: f, sections: s } = transformZzzWeapon({ page, listItem: item, localId, existing: existing && existing.fm });
    fm = f; sections = s;
  } else if (target.transform === 'zzz-equipment') {
    page = await src.getZzzEntry(contentId);
    const { fm: f, sections: s } = transformZzzEquipment({ page, listItem: item, localId, existing: existing && existing.fm });
    fm = f; sections = s;
  } else if (target.transform === 'zzz-bangboo') {
    page = await src.getZzzEntry(contentId);
    const { fm: f, sections: s } = transformZzzBangboo({ page, listItem: item, localId, existing: existing && existing.fm });
    fm = f; sections = s;
  } else if (target.transform === 'hsr-lightcone') {
    page = await src.getHsrContent(contentId);
    const result = transformHsrLightcone({ content: page, listItem: item, localId, existing: existing && existing.fm });
    fm = result.fm; sections = result.sections; sourceWarnings = result.sourceWarnings || [];
  } else if (target.transform === 'hsr-relic') {
    page = await src.getHsrContent(contentId);
    const { fm: f, sections: s } = transformHsrRelic({ content: page, listItem: item, localId, existing: existing && existing.fm });
    fm = f; sections = s;
  } else {
    throw new Error(`Unknown transform: ${target.transform}`);
  }
  const mergedFm = existing ? mergeFm(existing.fm, fm) : fm;
  const preamble = buildPreamble(mergedFm);
  const text = existing
    ? renderDoc(mergedFm, [], mergeBodies(preamble, sections, existing.body))
    : renderDoc(mergedFm, sections, preamble);
  const filename = existingPath
    ? path.basename(existingPath)
    : `${localId}_${sanitizeFilename(mergedFm.name)}.md`;
  return { kind: 'character', dir, filename, fm: mergedFm, text, existed: Boolean(existingPath), contentId, prevRaw: existing && existing.raw, sourceWarnings };
}

async function crawlCharacter(src, target, sel, args, anomalies) {
  const items = await src.listChannel(target.game, target.channel);
  const dir = path.join(DATA_ROOT, ...target.dir);
  const { assignments, orphans } = resolveBatchDir(items, dir);
  if (orphans.length) {
    console.log(`提示: ${path.relative(ROOT, dir)} 有 ${orphans.length} 个本地文件未被源条目匹配（保持不动）: ${orphans.join(', ')}`);
  }
  const hasSelector = Boolean(sel || args.id || args.name);
  if (!hasSelector) {
    const out = [];
    for (const item of items) {
      const existingPath = assignments.get(String(item.content_id));
      if (!existingPath) {
        anomalies.push(`${target.dir.join('/')}: 源条目在 data 中无文件 content_id=${item.content_id} ${item.title}`);
        continue;
      }
      const r = await crawlOne(src, target, item, { batch: true, existingPath });
      if (r) {
        out.push(r);
        for (const warning of r.sourceWarnings || []) {
          anomalies.push(`${target.dir.join('/')} ${r.filename}: ${warning}`);
        }
      }
    }
    return out;
  }
  const selector = sel ? (/^\d+$/.test(sel) ? { id: sel } : { name: sel }) : { id: args.id, name: args.name };
  const item = pickListItem(items, selector);
  const contentId = selector.id || (item && item.content_id);
  if (!contentId) throw new Error(`--target ${target.game}-character 需要 :id/:name 选择器或 --id/--name`);
  const opts = { selectorName: selector.name, contentId };
  if (item) opts.existingPath = assignments.get(String(item.content_id)) || null;
  return [await crawlOne(src, target, item, opts)];
}

async function crawlGacha(src, args) {
  const games = args.game ? [args.game] : ['zzz', 'hsr'];
  const results = [];
  for (const game of games) {
    const pools = await src.getGacha(game);
    const ids = [];
    for (const p of pools) {
      for (const item of p.pool || []) {
        const m = /\/content\/(\d+)\//.exec(item.url || '');
        if (m) ids.push(Number(m[1]));
      }
    }
    const titleMap = await src.resolveTitles(game, ids);
    const dir = path.join(DATA_ROOT, game, 'gacha');
    for (const pool of pools) {
      const existingPath = findExistingFile(dir, [pool.title]);
      const existing = existingPath ? readEntityFile(existingPath) : null;
      const { fm, sections } = transformGacha({ game, pool, titleMap });
      const mergedFm = existing ? mergeFm(existing.fm, fm) : fm;
      const preamble = buildPreamble(mergedFm);
      const text = existing
        ? renderDoc(mergedFm, [], mergeBodies(preamble, sections, existing.body))
        : renderDoc(mergedFm, sections, preamble);
      const filename = existingPath ? path.basename(existingPath) : `${pool.id}_${sanitizeFilename(mergedFm.name)}.md`;
      results.push({ kind: 'gacha', dir, filename, fm: mergedFm, text, existed: Boolean(existingPath), contentId: pool.id, prevRaw: existing && existing.raw });
    }
  }
  return results;
}

function validateResults(results) {
  let bad = 0;
  for (const r of results) {
    const v = validateRendered(r.text);
    r.validation = v;
    if (v.errors.length) bad++;
    const status = r.existed ? '修改' : '新建';
    console.log(`[${status}] ${path.relative(ROOT, path.join(r.dir, r.filename))}  content_id=${r.contentId}`);
    if (v.errors.length) console.log(`  错误: ${v.errors.join('; ')}`);
    if (v.warnings.length) console.log(`  警告: ${v.warnings.join('; ')}`);
    for (const warning of r.sourceWarnings || []) console.log(`  来源警告: ${warning}`);
  }
  return bad;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const specs = String(args.target || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!specs.length || specs.some((s) => !TARGETS[s.split(':')[0]])) {
    console.log('用法: node scripts/crawl-mihoyo.js --target <名称[:选择器]>[,...] [--id N | --name 名字] [--game zzz|hsr] [--write] [--print]');
    console.log('  目标: zzz-agent | hsr-character | zzz-weapon | zzz-equipment | zzz-bangboo | hsr-lightcone | hsr-relic | gacha；选择器: content_id 或 名字；省略选择器 = 该目标全量批量');
    console.log('  示例: --target zzz-agent:安比,hsr-character:48,gacha --write；全量: --target zzz-agent,hsr-character,gacha --write');
    console.log('  全量新类: --target zzz-weapon,zzz-equipment,zzz-bangboo,hsr-lightcone,hsr-relic --write');
    process.exit(1);
  }
  const write = Boolean(args.write);
  const fetcher = createFetcher({ rateLimitMs: 500, backoffMs: 500, proxy: process.env.http_proxy || null });
  const src = createMihoyoSource(fetcher);
  const anomalies = [];

  const results = [];
  let gachaDone = false;
  for (const spec of specs) {
    const [tname, sel] = (() => {
      const i = spec.indexOf(':');
      return i === -1 ? [spec, undefined] : [spec.slice(0, i), spec.slice(i + 1)];
    })();
    const target = TARGETS[tname];
    if (target.transform === 'gacha') {
      if (gachaDone) continue;
      gachaDone = true;
      results.push(...(await crawlGacha(src, args)));
    } else {
      results.push(...(await crawlCharacter(src, target, sel, args, anomalies)));
    }
  }

  const toWrite = results.filter((r) => !isUnchangedText(r.prevRaw, r.text));
  const bad = validateResults(toWrite);
  if (bad) {
    console.log(`校验失败（${bad} 个文件有错误），未写入`);
    process.exit(2);
  }
  if (anomalies.length) {
    console.log('异常:');
    for (const a of anomalies) console.log(`  - ${a}`);
  }

  if (!write) {
    if (results.length === 1 || args.print) {
      for (const r of results) {
        console.log(`\n===== ${path.join(r.dir, r.filename)} =====`);
        console.log(r.text);
      }
    } else {
      console.log(`预览模式：共 ${results.length} 个条目（本次实际变更 ${toWrite.length}），加 --write 落盘并生成报告`);
    }
    process.exit(anomalies.length ? 1 : 0);
  }

  const before = snapshot(DATA_ROOT);
  const touchedDirs = new Set();
  for (const r of toWrite) {
    writeEntityFile(r.dir, r.filename, r.fm, r.text);
    touchedDirs.add(r.dir);
  }
  for (const d of touchedDirs) touchState(d, { primary_source: 'mihoyo-api' });
  const after = snapshot(DATA_ROOT);
  const diff = diffSnapshots(before, after);
  if (!diff.added.length && !diff.modified.length && !diff.deleted.length) {
    console.log('无变更（data/ 与源一致）');
    process.exit(anomalies.length ? 1 : 0);
  }
  const report = buildReport(ROOT, { diff, snapshotBefore: before, snapshotAfter: after, anomalies });
  console.log(`\n已写入 ${toWrite.length} 个文件（共 ${results.length} 个条目）`);
  console.log(`报告: ${report && report.id ? report.id : path.join(ROOT, 'reports', '*.md')}`);
  console.log(`确认后执行: npm run sync -- --report ${report ? report.id : '<报告id>'}`);
  process.exit(anomalies.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});

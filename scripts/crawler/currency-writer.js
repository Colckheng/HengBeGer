import fs from 'node:fs';
import path from 'node:path';
import { renderDoc, splitSections, sanitizeFilename, stripCrawlTime } from './writer.js';
import { normDesc, renderCurrencyDesc } from './sources/nanoka.js';

const HSR_CDN = 'https://static.nanoka.cc/hsr';
const SEASONS = ['season1', 'season2'];

const CATEGORIES = {
  item: { dir: 'items', table: '物品图鉴.md', stateType: 'item', json: 'item.json', fmType: 'item' },
  strategy: { dir: 'strategies', table: '投资策略图鉴.md', stateType: 'strategy', json: 'augment.json', fmType: 'strategy' },
  environment: { dir: 'environments', table: '投资环境图鉴.md', stateType: 'environment', json: 'buff.json', fmType: 'environment' },
};

export function sourceUrl(version, json) {
  return `${HSR_CDN}/${version}/zh/currency/${json}`;
}

export function parseSeedTable(text) {
  const rows = [];
  for (const line of String(text || '').split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 4) continue;
    if (cells[1] === '#' || /^-*$/.test(cells[1] || '')) continue;
    rows.push(cells);
  }
  return rows;
}

export function readSeasonRows(dataRoot, category) {
  const cfg = CATEGORIES[category];
  const out = [];
  for (const season of SEASONS) {
    const file = path.join(dataRoot, 'currency', season, cfg.dir, cfg.table);
    if (!fs.existsSync(file)) continue;
    out.push({ season, file, rows: parseSeedTable(fs.readFileSync(file, 'utf8')) });
  }
  return out;
}

export function sectionText(body, heading) {
  const { sections } = splitSections(body);
  const s = sections.find((x) => x.heading === `## ${heading}`);
  return s ? s.lines.join('\n').trim() : '';
}

export { stripCrawlTime };

function assignAnomalies(category, label, unmatchedRows, unusedIds) {
  const out = [];
  for (const r of unmatchedRows) out.push(`${label} 种子行未匹配到源条目: ${r.season} ${r.key}`);
  for (const id of unusedIds) out.push(`${label} 源条目未出现在种子: id=${id}`);
  if (unmatchedRows.length || unusedIds.length) {
    out.unshift(`${category}: 种子行 ${unmatchedRows.length} 条未匹配 / 源 ${unusedIds.length} 条未使用，拒绝删除总表`);
  }
  return out;
}

export function assignItems(seasonRows, source) {
  const assign = new Map();
  const unmatched = [];
  const used = new Set();
  for (const { season, rows } of seasonRows) {
    for (const cells of rows) {
      const id = cells[2];
      if (!source[id]) {
        unmatched.push({ season, key: `${id}_${cells[3]}` });
        continue;
      }
      if (assign.has(id)) {
        unmatched.push({ season, key: `${id}_${cells[3]}（跨赛季重复）` });
        continue;
      }
      assign.set(id, { season, cells });
      used.add(id);
    }
  }
  const unused = Object.keys(source).filter((id) => !used.has(id));
  return { assign, anomalies: assignAnomalies('item', '物品', unmatched, unused) };
}

function groupRowsByName(seasonRows, nameIdx) {
  const byName = new Map();
  for (const { season, rows } of seasonRows) {
    for (const cells of rows) {
      const name = cells[nameIdx];
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push({ season, cells });
    }
  }
  return byName;
}

export function assignByName(seasonRows, source, { category, nameIdx, descIdx, renderDesc }) {
  const assign = new Map();
  const unmatched = [];
  const byNameCand = new Map();
  for (const [id, entry] of Object.entries(source)) {
    const n = entry.name;
    if (!byNameCand.has(n)) byNameCand.set(n, []);
    byNameCand.get(n).push(id);
  }
  const rowsByName = groupRowsByName(seasonRows, nameIdx);
  const used = new Set();
  for (const [name, rows] of rowsByName) {
    const cands = byNameCand.get(name) || [];
    const groupUsed = new Set();
    for (const row of rows) {
      const rowDesc = normDesc(row.cells[descIdx] || '');
      let pick = null;
      if (renderDesc) {
        pick = cands.find((id) => !groupUsed.has(id) && normDesc(renderDesc(source[id])) === rowDesc) || null;
      }
      if (!pick) pick = cands.find((id) => !groupUsed.has(id)) || null;
      if (!pick) {
        unmatched.push({ season: row.season, key: name });
        continue;
      }
      groupUsed.add(pick);
      used.add(pick);
      assign.set(pick, { season: row.season, cells: row.cells });
    }
  }
  const unused = Object.keys(source).filter((id) => !used.has(id));
  return { assign, anomalies: assignAnomalies(category, '名称', unmatched, unused) };
}

function baseFm(category, { id, name, season, version, now }) {
  const cfg = CATEGORIES[category];
  return {
    game: 'currency',
    type: cfg.fmType,
    tags: ['currency', cfg.fmType],
    赛季: season === 'season1' ? 'S1' : 'S2',
    id: Number(id),
    name,
    source: 'nanoka',
    source_url: sourceUrl(version, cfg.json),
    version,
    last_crawled_at: now,
    image: '',
  };
}

export function buildEntryDoc(category, { id, entry, season, seedCells, version, now }) {
  const fm = baseFm(category, { id, name: entry.name, season, version, now });
  const preamble = [`# ${entry.name}`];
  const sub = [`**ID**：${id}`];
  let sections = [];
  if (category === 'item') {
    if (entry.type) {
      fm['类型'] = entry.type;
      sub.push(`**类型**：${entry.type}`);
    }
    if (entry.equip_category) fm['稀有度'] = entry.equip_category;
    const english = seedCells ? seedCells[4] : '';
    if (english && english !== '-') preamble.push(`\n> English name: ${english}`);
    const effect = normDesc(entry.desc || '');
    if (effect && effect !== '-') sections.push({ heading: '## 效果', content: effect });
    const attr = seedCells ? seedCells[6] : '';
    if (attr && attr !== '-') sections.push({ heading: '## 属性', content: attr });
  } else if (category === 'strategy') {
    if (entry.quality) {
      fm['类型'] = entry.quality;
      sub.push(`**品质**：${entry.quality}`);
    }
    sections.push({ heading: '## 说明', content: normDesc(renderCurrencyDesc(entry.desc, entry.param_list)) });
  } else if (category === 'environment') {
    const rels = [];
    for (const b of Object.values(entry.bonus || {})) rels.push(...(b.combination_bonus_list || []));
    if (rels.length) fm['关联'] = rels.join('、');
    sections.push({ heading: '## 说明', content: normDesc(renderCurrencyDesc(entry.desc, entry.param_list)) });
  } else {
    throw new Error(`未知货币战争类别 ${category}`);
  }
  preamble.push(`\n${sub.join(' · ')}`);
  return { fm, text: renderDoc(fm, sections, preamble.join('\n')) };
}

export function refreshEntryFm(category, { id, entry, season, existingFm, version, now }) {
  const fm = baseFm(category, { id, name: entry.name, season, version, now });
  if (category === 'item') {
    if (entry.type) fm['类型'] = entry.type;
    if (entry.equip_category) fm['稀有度'] = entry.equip_category;
  }
  if (category === 'strategy' && entry.quality) fm['类型'] = entry.quality;
  if (category === 'environment') {
    const rels = [];
    for (const b of Object.values(entry.bonus || {})) rels.push(...(b.combination_bonus_list || []));
    if (rels.length) fm['关联'] = rels.join('、');
  }
  const merged = { ...existingFm, ...fm, tags: existingFm.tags || fm.tags };
  merged['image'] = existingFm.image !== undefined ? existingFm.image : '';
  return merged;
}

export function findEntryFile(dataRoot, category, season, id) {
  const cfg = CATEGORIES[category];
  const dir = path.join(dataRoot, 'currency', season, cfg.dir);
  if (!fs.existsSync(dir)) return null;
  const hit = fs.readdirSync(dir).find((f) => f.startsWith(`${id}_`) && f.endsWith('.md'));
  return hit ? path.join(dir, hit) : null;
}

export function findEntrySeason(dataRoot, category, id) {
  for (const season of SEASONS) {
    const p = findEntryFile(dataRoot, category, season, id);
    if (p) return { season, file: p };
  }
  return null;
}

export function entryFilename(id, name) {
  return `${id}_${sanitizeFilename(name)}.md`;
}

export function categoryConfig(category) {
  return CATEGORIES[category];
}

export function seasonList() {
  return [...SEASONS];
}

export default {
  sourceUrl,
  parseSeedTable,
  readSeasonRows,
  sectionText,
  stripCrawlTime,
  assignItems,
  assignByName,
  buildEntryDoc,
  refreshEntryFm,
  findEntryFile,
  findEntrySeason,
  entryFilename,
  categoryConfig,
  seasonList,
};

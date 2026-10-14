import path from 'node:path';
import crypto from 'node:crypto';
import { snapshot } from '../crawler/diff.js';
import { splitFrontMatter } from '../crawler/schema.js';
import { treeHash, verifyImageManifest } from '../crawler/report.js';

export const CATEGORIES = {
  'zzz/agents': '绝区零 · 代理人', 'zzz/sound_engines': '绝区零 · 音擎',
  'zzz/drive_disks': '绝区零 · 驱动盘', 'zzz/bangboo': '绝区零 · 邦布',
  'zzz/enemies': '绝区零 · 敌人', 'zzz/gacha': '绝区零 · 调频', 'zzz/formula': '绝区零 · 机制',
  'hsr/characters': '星铁 · 角色', 'hsr/light_cones': '星铁 · 光锥',
  'hsr/relics': '星铁 · 遗器', 'hsr/enemies': '星铁 · 敌人',
  'hsr/gacha': '星铁 · 跃迁', 'hsr/formula': '星铁 · 机制',
  ...Object.fromEntries([1, 2].flatMap(s => Object.entries({ roles: '角色', traits: '羁绊', items: '物品', strategies: '投资策略', environments: '投资环境' }).map(([k, n]) => [`currency/season${s}/${k}`, `货币战争 S${s} · ${n}`]))),
};
export function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
export const hash = value => crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(canonical(value))).digest('hex');

export function compileCatalog(root) {
  const dataRoot = path.join(root, 'data');
  verifyImageManifest(root);
  const files = snapshot(dataRoot);
  const manifest = JSON.parse(files.get('image-manifest.json')?.content || '{"assets":{}}');
  const checks = JSON.parse(files.get('source-checks.json')?.content || '{"records":{}}');
  const entries = [], keys = new Set(), images = new Map(), skipped = [];
  for (const [file, entry] of files) {
    if (!file.endsWith('.md') || file.endsWith('/_index.md') || file === 'README.md') continue;
    if (/^currency\/season[12]\/(roles\/角色图鉴|traits\/羁绊图鉴)\.md$/.test(file)) { skipped.push(file); continue; }
    const category = file.slice(0, file.lastIndexOf('/'));
    if (!CATEGORIES[category]) throw new Error(`Unknown data category: ${file}`);
    const { data: fm, body, error } = splitFrontMatter(entry.content);
    if (error) throw new Error(`${file}: ${error}`);
    if (!fm.id && category.startsWith('currency/') && /图鉴/.test(fm.name || fm.title || body.slice(0, 120))) { skipped.push(file); continue; }
    const id = String(fm.id ?? ''), name = fm.name || fm.标题 || fm.title;
    if (!id || id.length > 100 || typeof name !== 'string' || !name.trim() || name.length > 255) throw new Error(`Invalid identity: ${file}`);
    const key = `${category}/${id}`;
    if (keys.has(key)) throw new Error(`Duplicate identity: ${key}`);
    keys.add(key);
    const asset = fm.image ? manifest.assets[fm.image] : null;
    if (asset) images.set(asset.sha256, { ...asset, file: path.join(dataRoot, 'images', fm.image) });
    const issues = [];
    if (!asset && !/\/(gacha|formula)$/.test(category)) issues.push('暂无可用图片');
    if (fm.source === 'nanoka-seed') issues.push('保留种子数据，部分属性待核验');
    if (category.endsWith('/drive_disks') && !fm.稀有度) issues.push('来源未提供稀有度');
    const payload = canonical({ key, category, id, name, fields: fm, body, mdPath: file,
      imageHash: asset?.sha256 || null, sourceCheck: checks.records[file] || null, issues });
    entries.push({ key, category, name, payload, contentHash: hash(payload) });
  }
  entries.sort((a, b) => a.key.localeCompare(b.key, 'en'));
  return { entries, images, treeHash: treeHash(files), skipped };
}

export function normalizeRows(rows) {
  return rows.map(r => ({ ...r, payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload }));
}
export const databaseHash = rows => hash([...rows].sort((a,b) => a.key.localeCompare(b.key, 'en')).map(r => [r.key, r.category, r.name, r.contentHash, hash(r.payload)]));
export function planChanges(incoming, current) {
  const old = new Map(current.map(r => [r.key, r]));
  const added = [], updated = [], unchanged = [], conflicts = [];
  for (const row of current) if (hash(row.payload) !== row.contentHash || row.payload.key !== row.key || row.payload.category !== row.category || row.payload.name !== row.name) conflicts.push(row.key);
  for (const row of incoming) {
    const prior = old.get(row.key);
    if (!prior) added.push(row.key);
    else if (prior.contentHash !== row.contentHash) updated.push(row.key);
    else unchanged.push(row.key);
    old.delete(row.key);
  }
  return { added, updated, unchanged, retained: [...old.keys()], conflicts };
}

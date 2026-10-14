import crypto from 'node:crypto';

/**
 * Frozen copy of the category labels in scripts/catalog/data.js CATEGORIES
 * (same keys, same insertion order).
 *
 * The server must NOT import scripts/catalog/data.js: that module pulls in
 * scripts/crawler/report.js, whose copy on this branch predates the catalog
 * pipeline and no longer exports verifyImageManifest, so importing it throws
 * "does not provide an export named 'verifyImageManifest'" at boot. Keep this
 * list in sync with scripts/catalog/data.js when categories change.
 */
export const CATEGORIES = {
  'zzz/agents': '绝区零 · 代理人',
  'zzz/sound_engines': '绝区零 · 音擎',
  'zzz/drive_disks': '绝区零 · 驱动盘',
  'zzz/bangboo': '绝区零 · 邦布',
  'zzz/enemies': '绝区零 · 敌人',
  'zzz/gacha': '绝区零 · 调频',
  'zzz/formula': '绝区零 · 机制',
  'hsr/characters': '星铁 · 角色',
  'hsr/light_cones': '星铁 · 光锥',
  'hsr/relics': '星铁 · 遗器',
  'hsr/enemies': '星铁 · 敌人',
  'hsr/gacha': '星铁 · 跃迁',
  'hsr/formula': '星铁 · 机制',
  'currency/season1/roles': '货币战争 S1 · 角色',
  'currency/season1/traits': '货币战争 S1 · 羁绊',
  'currency/season1/items': '货币战争 S1 · 物品',
  'currency/season1/strategies': '货币战争 S1 · 投资策略',
  'currency/season1/environments': '货币战争 S1 · 投资环境',
  'currency/season2/roles': '货币战争 S2 · 角色',
  'currency/season2/traits': '货币战争 S2 · 羁绊',
  'currency/season2/items': '货币战争 S2 · 物品',
  'currency/season2/strategies': '货币战争 S2 · 投资策略',
  'currency/season2/environments': '货币战争 S2 · 投资环境',
};

/** sha256 hex digest, identical to scripts/catalog/data.js hash() for buffers. */
export const sha256Hex = value => crypto.createHash('sha256').update(value).digest('hex');

/**
 * Pure helpers behind the open index API:
 *   GET /api/catalog/index  -> { generatedAt, treeHash, groups, items }
 *   GET /api/catalog/entry  -> { ...item, sections, body }
 *
 * The algorithms mirror scripts/build-demo-data.mjs (the frozen demo build)
 * with two deliberate differences:
 *   1. entry: links are emitted for every key that exists in catalog_entries,
 *      not only for the 87 curated demo samples;
 *   2. an image URL is emitted only when the payload imageHash also has a
 *      matching catalog_assets row (db 模式) 或 /srv/images/t 下有对应文件（file 模式）。
 */

/**
 * 出图地址两态（设计文档 §3.5）：
 *   db   —— 默认。图片以 base64 存在 catalog_assets 里，走应用出图接口 /api/catalog/images/<hash>。
 *   file —— 云端。图片由阶段 2 在本机转成两档 WebP 落在磁盘上，交给 Nginx 直出：
 *           缩略图 /img/t/<hash>.webp（宽 320）、显示图 /img/d/<hash>.webp（长边 1280）。
 * 文件名就是图片内容的 sha256，内容变则文件名变，所以 immutable 缓存名正言顺。
 * 只在云端设 IMAGE_MODE=file；本机与测试不设，行为与以前完全一致。
 */
export const IMAGE_MODE = process.env.IMAGE_MODE === 'file' ? 'file' : 'db';

/** 由 (imageHash, 这张图是否存在, 模式) 推出对外的图片地址。导出以便单测两种模式。 */
export function imageUrls(imageHash, hasImage, mode = IMAGE_MODE) {
  if (!imageHash || !hasImage) return { image: null, imageLarge: null };
  if (mode === 'file') {
    return { image: `/img/t/${imageHash}.webp`, imageLarge: `/img/d/${imageHash}.webp` };
  }
  return { image: `/api/catalog/images/${imageHash}`, imageLarge: null };
}

export const CATEGORY_ENTRIES = Object.entries(CATEGORIES);

export const TYPE_ALIASES = {
  role: 'roles',
  trait: 'traits',
  item: 'items',
  augment: 'strategies',
  buff: 'environments',
  character: 'characters',
  lightcone: 'light_cones',
  relicset: 'relics',
  weapon: 'sound_engines',
  equipment: 'drive_disks',
  monster: 'enemies',
};

const PENDING_NAME_RE = /^(OfficialName_|未命名)$/;
const UNVERIFIED_NAME_RE = /OfficialName_|未命名|NICKNAME/;

export const ISSUE_LV80 = '当前摘要为Lv.80；历史正文保留其原始等级，请分开阅读。';
export const ISSUE_SIX_STAR = '星级字段为5，原文显示六星；星级与星阶含义仍待核验。';
export const ISSUE_DYNAMIC_REF = '部分来源文本含动态引用或异常数值标记，尚待核验。';
export const ISSUE_UNNAMED = '来源未提供可确认的完整名称。';
export const ISSUE_SNAPSHOT = '日期与状态按来源快照展示，不代表当前开放情况。';

export const safeName = value => String(value ?? '')
  .replace(/<\/?unbreak>/gi, '')
  .replace(/<[^>]*>/g, '')
  .replace(/\{NICKNAME\}/g, '开拓者（原名待核验）');

export const displayName = (name, id) => (PENDING_NAME_RE.test(String(name ?? ''))
  ? `名称待补充 · ${id}`
  : safeName(name));

/** MySQL JSON columns come back parsed, but tests/fixtures may hand over strings. */
export function parsePayload(payload) {
  if (payload === null || payload === undefined) return {};
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch {
      return {};
    }
  }
  return payload;
}

/** Same base/alias resolution as scripts/build-demo-data.mjs resolve(). */
export function resolveEntryKey(category, type, id) {
  const value = String(category ?? '');
  const parts = value.split('/');
  const base = value.startsWith('currency/') ? parts.slice(0, 2).join('/') : parts[0];
  const bucket = value.startsWith('zzz/') && type === 'character'
    ? 'agents'
    : TYPE_ALIASES[type] || type;
  return `${base}/${bucket}/${id}`;
}

/**
 * @param {Array<{key: string, name?: string, id?: string}>} entries
 * @returns {(category: string, type?: string, id?: string) => ({key, name, id}|null)}
 */
export function createEntryLookup(entries) {
  const byKey = new Map((entries || []).map(entry => [entry.key, {
    key: entry.key,
    name: entry.name,
    id: entry.id,
  }]));
  return (category, type, id) => {
    if (!type || !id) return null;
    return byKey.get(resolveEntryKey(category, type, id)) || null;
  };
}

export function deriveIssues(payload, rawName) {
  const issues = [];
  const category = String(payload?.category ?? '');
  if (category === 'hsr/enemies' && payload?.fields?.['属性等级']) issues.push(ISSUE_LV80);
  if (payload?.key === 'currency/season2/roles/151122') issues.push(ISSUE_SIX_STAR);
  if (/<gridfightinfo|\b\d+i\b/.test(String(payload?.body ?? ''))) issues.push(ISSUE_DYNAMIC_REF);
  if (UNVERIFIED_NAME_RE.test(String(rawName ?? ''))) issues.push(ISSUE_UNNAMED);
  if (category.endsWith('/gacha')) issues.push(ISSUE_SNAPSHOT);
  return issues;
}

function itemFromPayload(payload, row, assetHashes) {
  const key = payload.key ?? row.key;
  const id = payload.id ?? '';
  const rawName = payload.name ?? row.name ?? '';
  const imageHash = payload.imageHash ?? null;
  const issues = Array.isArray(payload.issues) ? payload.issues : [];
  const category = payload.category ?? row.category ?? '';
  // 缩略图与显示图：db 模式只有 image（原图），file 模式给两档。
  const { image, imageLarge } = imageUrls(imageHash, Boolean(imageHash && assetHashes?.has(imageHash)));

  return {
    key,
    id,
    category,
    name: displayName(rawName, id),
    rawName,
    image,
    imageLarge,
    fields: payload.fields ?? null,
    issues: [...new Set([
      ...issues,
      ...deriveIssues({ category, key, body: payload.body, fields: payload.fields }, rawName),
    ])],
    sourceCheck: payload.sourceCheck ?? null,
    detailFile: `/api/catalog/entry?key=${encodeURIComponent(key)}`,
  };
}

export const buildItem = (row, assetHashes) => itemFromPayload(parsePayload(row.payload), row, assetHashes);

/** Rows are ordered category asc, key asc (utf8mb4_bin collation = byte order). */
function compareRows(a, b) {
  const aCategory = a.category ?? '';
  const bCategory = b.category ?? '';
  if (aCategory !== bCategory) return aCategory < bCategory ? -1 : 1;
  const aKey = a.key ?? '';
  const bKey = b.key ?? '';
  if (aKey === bKey) return 0;
  return aKey < bKey ? -1 : 1;
}

export function buildGroups(rows) {
  const counts = new Map();
  for (const row of rows) {
    const category = row.category ?? parsePayload(row.payload).category ?? '';
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return CATEGORY_ENTRIES.map(([id, name]) => {
    const count = counts.get(id) ?? 0;
    return { id, name, total: count, count };
  });
}

/** MAX(payload.fields.last_crawled_at), falling back to `fallback` when absent. */
export function resolveGeneratedAt(rows, fallback = new Date().toISOString()) {
  let latest = null;
  for (const row of rows) {
    const value = parsePayload(row.payload).fields?.['last_crawled_at'];
    if (typeof value !== 'string') continue;
    const time = Date.parse(value);
    if (Number.isNaN(time)) continue;
    if (latest === null || time > latest) latest = time;
  }
  return latest === null ? fallback : new Date(latest).toISOString();
}

export function buildIndex(rows, assetHashes, fallbackGeneratedAt = new Date().toISOString()) {
  const sorted = [...rows].sort(compareRows);
  return {
    generatedAt: resolveGeneratedAt(sorted, fallbackGeneratedAt),
    treeHash: null,
    groups: buildGroups(sorted),
    items: sorted.map(row => itemFromPayload(parsePayload(row.payload), row, assetHashes)),
  };
}

export function cleanBody(payload, lookup = () => null) {
  const category = String(payload?.category ?? '');
  const reference = (_match, attrs) => {
    const type = /type=["']?([\w]+)/.exec(attrs)?.[1];
    const id = /id=["']?(\d+)/.exec(attrs)?.[1];
    const match = lookup(category, type, id);
    return match
      ? `[${displayName(match.name, match.id)}](entry:${match.key})`
      : `关联资料${id ? ` #${id}` : ''}（待解析）`;
  };

  return String(payload?.body ?? '')
    .replace(/<gridfightinfo\s+([^>]+)>[\s\S]*?<\/gridfightinfo>/gi, reference)
    .replace(/<gridfightinfo\s+([^>]+)>/gi, reference)
    .replace(/<\/?(?:unbreak|i|b|color)(?:\s[^>]*)?>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\[([^\]]+)\]\(\.\.\/([a-z_]+)\/(\d+)[^)]*\.md\)/g, (_match, label, type, id) => {
      const match = lookup(category, type, id);
      return match ? `[${displayName(match.name, match.id)}](entry:${match.key})` : safeName(label);
    });
}

export function buildSections(body) {
  const parts = [];
  let current = { title: '概述', body: '' };
  for (const line of String(body ?? '').split(/\r?\n/)) {
    const heading = /^##\s+(.+)/.exec(line);
    if (heading) {
      if (current.body.trim()) parts.push(current);
      current = { title: heading[1], body: '' };
    } else if (!/^#\s+/.test(line)) {
      current.body += `${line}\n`;
    }
  }
  if (current.body.trim()) parts.push(current);
  return parts.map((section, index) => ({ ...section, id: `section-${index}` }));
}

export function buildEntry(row, assetHashes, lookup) {
  const payload = parsePayload(row.payload);
  const body = cleanBody(payload, lookup);
  return {
    ...itemFromPayload(payload, row, assetHashes),
    sections: buildSections(body),
    body,
  };
}

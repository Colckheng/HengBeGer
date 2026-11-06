/** 图鉴列表的筛选与分页（纯函数，可单测）。 */

export function filterItems(items, { scope = '', category = '', q = '', page = 1, limit = 30 } = {}) {
  const list = Array.isArray(items) ? items : [];
  const needle = String(q || '').trim().toLowerCase();
  const filtered = list.filter((item) => {
    const itemCategory = String(item.category || '');
    if (scope && !itemCategory.startsWith(scope)) return false;
    if (category && itemCategory !== category && !itemCategory.startsWith(category + '/')) return false;
    if (!needle) return true;
    return [item.name, item.rawName, item.key]
      .some((value) => String(value || '').toLowerCase().includes(needle));
  });

  const pageSize = Math.max(1, Number(limit) || 30);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(Math.max(1, Number(page) || 1), pageCount);
  const start = (current - 1) * pageSize;
  return {
    items: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page: current,
    pageCount,
    pageSize,
  };
}

export function categoriesOf(index, worldId = '') {
  const groups = Array.isArray(index && index.groups) ? index.groups : [];
  return groups
    .filter((group) => !worldId || String(group.id).startsWith(worldId + '/'))
    .map((group) => ({ id: group.id, name: group.name, count: group.count ?? group.total ?? 0 }));
}

const WORLD_ORDER = ['zzz', 'hsr', 'currency'];
const WORLD_TITLES = { zzz: '绝区零', hsr: '星穹铁道', currency: '货币战争' };

/** 分类按世界分组：已知世界保持固定顺序，未知世界按首次出现排在后面。 */
export function categoriesGroupedByWorld(categories) {
  const buckets = new Map();
  for (const group of Array.isArray(categories) ? categories : []) {
    const worldId = String(group.id || '').split('/')[0];
    if (!worldId) continue;
    if (!buckets.has(worldId)) buckets.set(worldId, []);
    buckets.get(worldId).push(group);
  }
  const ordered = WORLD_ORDER.filter((id) => buckets.has(id));
  for (const id of buckets.keys()) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  return ordered.map((id) => ({
    id,
    title: WORLD_TITLES[id] || id,
    categories: buckets.get(id),
  }));
}

/**
 * 分类 chip 文本，与网页端保持一致：
 * 选定世界后只留分类词（"代理人"）；在"全部"视图下带世界与赛季
 * （"绝区零 代理人"、"货币战争 S1 角色"），否则同名分类会撞成两个一样的 chip。
 */
export function categoryChipLabel(name = '', { keepWorld = false } = {}) {
  const text = String(name);
  const match = /^(绝区零|星铁|货币战争)\s*(S\d+)?\s*·\s*/.exec(text);
  if (!match) return text;
  const rest = text.slice(match[0].length);
  if (!keepWorld) return rest;
  return `${match[1]}${match[2] ? ` ${match[2]}` : ''} ${rest}`;
}

/** 各分类的二级筛选项（字段名），按全库真实字段分布配置；低覆盖字段（驱动盘稀有度 12/30）不作为默认筛选。 */
const CATEGORY_FILTER_FIELDS = {
  agents: ['属性', '特性', '攻击方式', '阵营', '评级', '星级'],
  characters: ['属性', '命途', '星级', '阵营'],
  sound_engines: ['特性', '稀有度', '星级'],
  light_cones: ['命途', '星级'],
  drive_disks: [],
  relics: ['类型'],
  bangboo: ['稀有度', '星级'],
  enemies: ['评级', '阵营', '弱点'],
  gacha: [],
  formula: [],
  roles: ['站位', '特性', '星阶'],
  traits: ['成员数'],
  items: ['类型'],
  strategies: ['类型'],
  environments: [],
};

/** 取某分类的二级筛选字段列表；未知分类返回空数组。 */
export function filterFieldsFor(category) {
  const parts = String(category || '').split('/');
  const type = parts[parts.length - 1];
  // 货币战争按 S1/S2 分组，但筛选字段两季一致。
  return CATEGORY_FILTER_FIELDS[type] || [];
}

/** 收集某分类在给定字段上的可选值（保持出现顺序），并标记"未提供"。 */
export function facetValues(items, category, field) {
  const seen = new Set();
  const values = [];
  let missing = false;
  for (const item of Array.isArray(items) ? items : []) {
    if (category && String(item.category || '') !== category) continue;
    const raw = item.fields ? item.fields[field] : undefined;
    if (raw === undefined || raw === null || String(raw).trim() === '') { missing = true; continue; }
    for (const part of String(raw).split(/[、/]/)) {
      const value = part.trim();
      if (value && !seen.has(value)) { seen.add(value); values.push(value); }
    }
  }
  return { values, missing };
}

export function toggleFacet(facets, field, value) {
  const current = facets[field] || [];
  const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
  const result = { ...facets };
  if (next.length) result[field] = next;
  else delete result[field];
  return result;
}

export function changeScope(category) {
  return { category, facets: {} };
}

/**
 * 选定世界后，分类行的范围：货币战争按当前赛季切，其余世界用世界 id 本身。
 * 返回的 category 用于"全部分类"这一档，即列出该世界下的全部条目。
 */
export function scopeCategory(worldId, season = 'season1') {
  if (!worldId) return '';
  return worldId === 'currency' ? `currency/${season}` : worldId;
}

/** 世界下的分类列表；货币战争按赛季过滤。 */
export function categoriesInScope(categories, worldId, season = 'season1') {
  const list = (Array.isArray(categories) ? categories : []).filter((group) => String(group.id || '').startsWith(`${worldId}/`));
  if (worldId !== 'currency') return list;
  return list.filter((group) => String(group.id || '').startsWith(`currency/${season}/`));
}

export function changeSeason(category, season, facets, items) {
  const parts = String(category).split('/');
  const target = `currency/${season}${parts[2] ? `/${parts[2]}` : ''}`;
  /** @type {Record<string, string[]>} */
  const kept = {};
  for (const field of filterFieldsFor(target)) {
    const options = facetValues(items, target, field);
    const selected = (facets[field] || []).filter((value) => value === '__missing__' ? options.missing : options.values.includes(value));
    if (selected.length) kept[field] = selected;
  }
  return { category: target, facets: kept };
}

/** 同字段选项为或，不同字段之间为且；兼容原有单值筛选。 */
export function applyFacets(items, filters) {
  const active = Object.entries(filters || {}).map(([field, value]) => [field, Array.isArray(value) ? value : [value]]).filter(([, values]) => values.some(Boolean));
  if (!active.length) return Array.isArray(items) ? items : [];
  return (Array.isArray(items) ? items : []).filter((item) => active.every(([field, values]) => {
    const raw = item.fields ? item.fields[field] : undefined;
    const missing = raw === undefined || raw === null || String(raw).trim() === '';
    return values.some((value) => value === '__missing__' ? missing : !missing && String(raw).split(/[、/]/).map((part) => part.trim()).includes(value));
  }));
}

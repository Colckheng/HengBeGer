/**
 * 概念页的浏览状态：地址 ↔ 状态互转、筛选条件与赛季切换。
 * 纯函数，不依赖 React，便于直接测试。
 */

export const WORLDS = [{id:'zzz', name:'绝区零'}, {id:'hsr', name:'星穹铁道'}, {id:'currency', name:'货币战争'}];

/** 各分类可用的二级筛选字段。字段口径存疑的一律不进列表。 */
export const FILTER_FIELDS = {
  agents:['属性','特性','攻击方式','阵营','评级','星级'],
  characters:['属性','命途','星级','阵营'],
  sound_engines:['特性','稀有度','星级'],
  light_cones:['命途','星级'],
  relics:['类型'],
  bangboo:['稀有度','星级'],
  enemies:['评级','阵营','弱点'],
  roles:['站位','特性','星阶'],
  traits:['成员数'],
  items:['类型'],
  strategies:['类型'],
};

export const INITIAL_STATE = {world:'all',category:'all',query:'',facets:{},itemId:null,season:'season1'};

export function groupFor(groups, category) {
  return (groups || []).find(group => group.id === category);
}

export function identity(item) {
  return `${item.category}/${item.id}`;
}

export function valueParts(value) {
  return String(value).split(/[、/]/).map(part => part.trim()).filter(Boolean);
}

export function isMissing(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

/** 从地址读取浏览状态。未知分类、未知筛选字段一律忽略。 */
export function readLocation(search, groups = []) {
  const params = new URLSearchParams(search);
  const requested = params.get('category');
  const category = groupFor(groups, requested) ? requested : 'all';
  const world = category !== 'all'
    ? category.split('/')[0]
    : (WORLDS.some(w => w.id === params.get('world')) ? params.get('world') : 'all');
  const facets = {};
  const allowed = FILTER_FIELDS[category.split('/').at(-1)] || [];
  for (const [key, value] of params) {
    if (!key.startsWith('f.') || !allowed.includes(key.slice(2)) || !value) continue;
    const field = key.slice(2);
    facets[field] ||= [];
    if (!facets[field].includes(value)) facets[field].push(value);
  }
  return {
    world,
    category,
    query: params.get('q') || '',
    facets,
    itemId: params.get('item') || null,
    itemCategory: params.get('itemCategory') || category,
    season: category.startsWith('currency/season2/') || params.get('season') === 'season2' ? 'season2' : 'season1',
  };
}

/** 同一字段多选；字段之间取交集。 */
export function matchesFacets(entry, facets) {
  return Object.entries(facets || {}).every(([field, values]) => values.some(value => (
    value === '__missing__'
      ? isMissing(entry.fields?.[field])
      : !isMissing(entry.fields?.[field]) && valueParts(entry.fields[field]).includes(value)
  )));
}

/** 切换赛季：保留分类与搜索，清掉不再适用的筛选。 */
export function changeSeason(state, season) {
  return {
    ...state,
    season,
    category: state.category.startsWith('currency/season')
      ? state.category.replace(/season[12]/, season)
      : state.category,
    facets: {},
    itemId: null,
  };
}

export function toggleFacet(facets, field, value) {
  const selected = facets[field] || [];
  const next = selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value];
  const result = { ...facets };
  if (next.length) result[field] = next;
  else delete result[field];
  return result;
}

/**
 * 只有列表状态真的变了才恢复滚动位置。
 * 点击目录里的锚点只会改 hash，查询参数没变 —— 这时不能把页面滚回顶部，
 * 否则刚跳到某个技能就又被拉回去。
 */
export function shouldRestoreScroll(previousSearch, nextSearch) {
  return previousSearch !== nextSearch;
}

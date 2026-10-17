/** 分类 id（zzz/agents 这种）到中文展示名的映射（纯函数，可单测）。
 *
 * 服务端的 /api/catalog/index 里 groups 已经带好中文名（"绝区零 · 代理人"），
 * 优先用那份；拿不到 groups 时（比如详情页只拿到 entry.category）按
 * 世界 + 末段词表兜底，别让用户看到 "zzz/agents" 这种采集路径。
 */
import { WORLDS, worldOf } from './home.js';

export { WORLDS, worldOf };

/** 分类末段的英文 -> 中文（与服务端 groups 的用词保持一致）。 */
export const CATEGORY_WORDS = {
  agents: '代理人',
  sound_engines: '音擎',
  drive_disks: '驱动盘',
  bangboo: '邦布',
  enemies: '敌人',
  gacha: '调频',
  formula: '机制',
  characters: '角色',
  light_cones: '光锥',
  relics: '遗器',
  roles: '角色',
  traits: '羁绊',
  items: '物品',
  strategies: '投资策略',
  environments: '投资环境',
};

/** 分类末段的中文名；赛季段（season1）单独转成 "S1"。 */
export function categoryWords(category = '') {
  const parts = String(category || '').split('/').filter(Boolean);
  const last = parts[parts.length - 1] || '';
  const words = CATEGORY_WORDS[last] || last;
  const season = parts.find((part) => /^season\d+$/i.test(part));
  if (!season) return words;
  return 'S' + season.replace(/^season/i, '') + ' · ' + words;
}

/**
 * 分类的展示名。
 * @param {string} category 例如 "zzz/agents"、"currency/season1/roles"
 * @param {Array<{id: string, name: string}>} groups index.groups（可选，命中优先）
 */
export function categoryName(category = '', groups = []) {
  const id = String(category || '');
  if (!id) return '';
  const hit = (Array.isArray(groups) ? groups : []).find((group) => group && group.id === id);
  if (hit && hit.name) return String(hit.name);
  const world = worldOf(id);
  const words = categoryWords(id);
  return world ? world.title + ' · ' + words : words;
}

/** 从 index 里建 key -> { name, image, category } 的映射（收藏/历史页补封面与名字用）。 */
export function itemByKey(index) {
  const items = Array.isArray(index && index.items) ? index.items : [];
  const map = new Map();
  for (const item of items) {
    if (item && item.key) {
      map.set(item.key, {
        name: item.name || item.rawName || item.key,
        image: item.image || null,
        category: item.category || '',
      });
    }
  }
  return map;
}

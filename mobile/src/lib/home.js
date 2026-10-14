/** 首页数据装配（纯函数，可单测）：三世界卡片 + 常用分类 + 最近更新。 */

export const WORLDS = [
  {
    id: 'zzz',
    title: '绝区零',
    en: 'ZENLESS ZONE ZERO',
    tagline: '都市的另一面，从相遇开始。',
    quick: ['zzz/agents', 'zzz/sound_engines', 'zzz/bangboo', 'zzz/enemies'],
  },
  {
    id: 'hsr',
    title: '星穹铁道',
    en: 'HONKAI: STAR RAIL',
    tagline: '沿着星轨，发现新的可能。',
    quick: ['hsr/characters', 'hsr/light_cones', 'hsr/relics', 'hsr/enemies'],
  },
  {
    id: 'currency',
    title: '货币战争',
    en: 'CURRENCY WARS',
    tagline: '读懂规则，让组合产生回响。',
    quick: ['currency/season1/roles', 'currency/season1/traits', 'currency/season2/roles', 'currency/season2/strategies'],
  },
];

export function worldOf(keyOrCategory) {
  const id = String(keyOrCategory || '').split('/')[0];
  return WORLDS.find((world) => world.id === id) || null;
}

export function totalCount(index) {
  return Array.isArray(index && index.items) ? index.items.length : 0;
}

export function buildHomeModel(index, { recentLimit = 6 } = {}) {
  const items = Array.isArray(index && index.items) ? index.items : [];
  const groups = Array.isArray(index && index.groups) ? index.groups : [];
  const byId = new Map(groups.map((group) => [group.id, group]));

  return WORLDS.map((world) => {
    const mine = items.filter((item) => String(item.category || item.key || '').startsWith(world.id + '/'));
    const quick = (world.quick || [])
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((group) => ({ id: group.id, name: group.name, count: group.count ?? group.total ?? 0 }));
    const dated = mine.filter((item) => item.updatedAt);
    const pool = dated.length
      ? dated.slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      : mine;
    const recent = pool.slice(0, recentLimit).map((item) => ({
      key: item.key,
      name: item.name || item.rawName || item.key,
      image: item.image || null,
    }));
    return { ...world, total: mine.length, quick, recent, generatedAt: index && index.generatedAt ? index.generatedAt : null };
  });
}

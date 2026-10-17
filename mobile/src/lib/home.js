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

/**
 * 条目的时间戳。索引里没有顶层 updatedAt（服务端 /api/catalog/index 不输出），
 * 但每条 item 带着 fields，采集时间在 fields.last_crawled_at 里。
 */
export function recencyOf(item) {
  const raw = (item && (item.updatedAt || (item.fields && item.fields.last_crawled_at))) || '';
  const time = Date.parse(String(raw));
  return Number.isNaN(time) ? 0 : time;
}

/**
 * 按分类轮转挑「最近更新」。
 * 直接按时间倒序取前 N 个会退化成「同一次采集的同一批条目」（zzz 全是邦布、
 * hsr 全是敌人、currency 全是投资环境），六格缩略图看起来一模一样；
 * 按分类轮转能让每个世界首页都露出角色/音擎/光锥等不同类型的入口。
 *
 * 只挑有封面的条目：全库 2675 条里 157 条没有图（hsr/gacha 65 张全无、
 * zzz/enemies 63 张无），无图条目渲染出来是一块纯色灰方块，跟「图加载失败」
 * 一模一样。凑不够 recentLimit 时 buildHomeModel 会回退到不过滤的结果。
 */
export function pickRecent(items, limit) {
  const list = Array.isArray(items) ? items : [];
  const buckets = new Map();
  for (const item of list) {
    const category = String((item && item.category) || '');
    if (!buckets.has(category)) buckets.set(category, []);
    buckets.get(category).push(item);
  }
  const order = [...buckets.keys()];
  const picked = [];
  for (let round = 0; picked.length < limit; round += 1) {
    let advanced = false;
    for (const category of order) {
      const bucket = buckets.get(category);
      if (round >= bucket.length) continue;
      picked.push(bucket[round]);
      advanced = true;
      if (picked.length >= limit) break;
    }
    if (!advanced) break;
  }
  return picked;
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
    // 时间倒序（没有时间戳的条目按原顺序垫后），再按分类轮转取前 N 个。
    const ranked = mine
      .map((item, position) => ({ item, position, time: recencyOf(item) }))
      .sort((a, b) => (b.time - a.time) || (a.position - b.position))
      .map((entry) => entry.item);
    // 优先只挑有封面的；整个世界的条目都没图时才回退，免得六格里少几格。
    const withCover = ranked.filter((item) => item && item.image);
    const pool = withCover.length >= recentLimit ? withCover : ranked;
    const recent = pickRecent(pool, recentLimit).map((item) => ({
      key: item.key,
      name: item.name || item.rawName || item.key,
      image: item.image || null,
      // 无封面条目的占位文字用（整个世界都没图时才会走到）
      category: item.category || '',
    }));
    return { ...world, total: mine.length, quick, recent, generatedAt: index && index.generatedAt ? index.generatedAt : null };
  });
}

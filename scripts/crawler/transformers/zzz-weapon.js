import { stripHtml } from '../html.js';

function safeParse(x) {
  if (typeof x !== 'string') return x;
  try { return JSON.parse(x); } catch { return null; }
}

export function transformZzzWeapon({ page, listItem, localId, existing, now = new Date() }) {
  const f = (listItem && listItem.filters) || {};
  const ext = safeParse(page.ext?.fe_ext) || {};
  const pageFilters = ext?.c_45?.filter?.text ? JSON.parse(ext.c_45.filter.text) : [];
  const pf = {};
  for (const pair of pageFilters) {
    const i = pair.indexOf('/');
    if (i > 0) pf[pair.slice(0, i)] = pair.slice(i + 1);
  }

  const name = (existing && existing.name) || page.name;
  const alias = page.alias_name || (page.name !== name ? page.name : undefined);

  let baseAtk = 0;
  let subStatType = '';
  let subStatValue = '';
  let skillName = '';
  for (const m of page.modules || []) {
    for (const comp of m.components || []) {
      if (comp.component_id === 'multi_table') {
        const d = safeParse(comp.data);
        for (const t of d.tables || []) for (const row of t.row || []) {
          const txt = stripHtml((row || []).join(' '));
          const m1 = /基础攻击力\+(\d+)/.exec(txt);
          if (m1 && !baseAtk) baseAtk = parseInt(m1[1], 10);
          const m2 = /(?:初始|满级)面板[：:]\s*基础攻击力\+\d+\s+([^，\s]+)\s*[+\d%]+/.exec(txt);
          if (m2 && !subStatType) subStatType = m2[1].trim();
          const m3 = /(?:初始|满级)面板[：:].*?\+\d+\s*%/.exec(txt);
          if (m3 && !subStatValue) {
            const v = /\+(\d+)%/.exec(m3[0]);
            if (v) subStatValue = '+' + v[1] + '%';
          }
          const m4 = /(?:永夜|技能|音擎)[：\s]*([\u4e00-\u9fa5]{2,6})/.exec(txt);
          if (m4 && !skillName) skillName = m4[1].trim();
        }
      }
    }
  }

  const grade = pf['稀有度'] || f['稀有度'] || '';
  const feature = pf['特性'] || f['特性'] || '';
  const rarityMap = { S: 5, A: 4, B: 3, C: 2, D: 1 };
  const rarity = grade ? rarityMap[grade] : undefined;

  const fm = {
    game: 'zzz',
    type: 'weapon',
    id: String(localId),
    name,
    ...(alias ? { alias } : {}),
    tags: ['zzz', 'weapon'],
    ...(feature ? { 特性: feature } : {}),
    ...(grade ? { 稀有度: grade } : {}),
    ...(rarity ? { 星级: rarity } : {}),
    ...(baseAtk ? { 基础攻击力: baseAtk } : {}),
    ...(subStatType ? { 副词条类型: subStatType } : {}),
    ...(subStatValue ? { 副词条数值: subStatValue } : {}),
    ...(skillName ? { 技能名: skillName } : {}),
    source: 'mihoyo-api',
    source_url: `https://www.miyoushe.com/zzz/wiki/content/${page.id}/detail`,
    version: String(page.version),
    last_crawled_at: now.toISOString(),
    image: (existing && existing.image) || '',
  };
  Object.keys(fm).forEach((k) => fm[k] === undefined && delete fm[k]);
  return { fm, sections: [] };
}

export default transformZzzWeapon;
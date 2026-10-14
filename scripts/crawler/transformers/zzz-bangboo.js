import { stripHtml, cellText } from '../html.js';

function safeParse(x) {
  if (typeof x !== 'string') return x;
  try { return JSON.parse(x); } catch { return null; }
}

export function transformZzzBangboo({ page, _listItem, localId, existing, now = new Date() }) {
  const name = (existing && existing.name) || page.name;
  const alias = page.alias_name || (page.name !== name ? page.name : undefined);

  let grade = '';
  let hp = 0, atk = 0, def = 0, impact = 0;
  for (const m of page.modules || []) {
    for (const comp of m.components || []) {
      if (comp.component_id === 'material_base_info') {
        const d = safeParse(comp.data);
        grade = d.grade || '';
      }
      if (comp.component_id === 'role_ascension') {
        const d = safeParse(comp.data);
        const tab0 = (d.list || [])[0];
        for (const a of (tab0 && tab0.attr) || []) {
          const k = cellText(a.key || '');
          const v = a.value;
          if (k === '生命值') hp = parseInt(stripHtml(String(v)), 10) || 0;
          else if (k === '攻击力') atk = parseInt(stripHtml(String(v)), 10) || 0;
          else if (k === '防御力') def = parseInt(stripHtml(String(v)), 10) || 0;
          else if (k === '冲击力') impact = parseInt(stripHtml(String(v)), 10) || 0;
        }
      }
    }
  }

  const rarityMap = { S: 5, A: 4, B: 3, C: 2, D: 1 };
  const rarity = grade ? rarityMap[grade] : undefined;

  const fm = {
    game: 'zzz',
    type: 'bangboo',
    id: String(localId),
    name,
    ...(alias ? { alias } : {}),
    tags: ['zzz', 'bangboo'],
    ...(grade ? { 稀有度: grade } : {}),
    ...(rarity ? { 星级: rarity } : {}),
    ...(hp ? { 生命值: hp } : {}),
    ...(atk ? { 攻击力: atk } : {}),
    ...(def ? { 防御力: def } : {}),
    ...(impact ? { 冲击力: impact } : {}),
    source: 'mihoyo-api',
    source_url: `https://www.miyoushe.com/zzz/wiki/content/${page.id}/detail`,
    version: String(page.version),
    last_crawled_at: now.toISOString(),
    image: (existing && existing.image) || '',
  };
  Object.keys(fm).forEach((k) => fm[k] === undefined && delete fm[k]);
  return { fm, sections: [] };
}

export default transformZzzBangboo;
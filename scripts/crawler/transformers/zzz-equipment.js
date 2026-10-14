function safeParse(x) {
  if (typeof x !== 'string') return x;
  try { return JSON.parse(x); } catch { return null; }
}

export function transformZzzEquipment({ page, _listItem, localId, existing, now = new Date() }) {
  const name = (existing && existing.name) || page.name;
  const alias = page.alias_name || (page.name !== name ? page.name : undefined);

  let grade = '';
  for (const m of page.modules || []) {
    for (const comp of m.components || []) {
      if (comp.component_id === 'material_base_info') {
        const d = safeParse(comp.data);
        grade = d.grade || '';
        break;
      }
    }
  }
  // Drive disks may not have rarity; keep seed if any
  const fm = {
    game: 'zzz',
    type: 'equipment',
    id: String(localId),
    name,
    ...(alias ? { alias } : {}),
    tags: ['zzz', 'equipment'],
    ...(grade ? { 稀有度: grade } : {}),
    source: 'mihoyo-api',
    source_url: `https://www.miyoushe.com/zzz/wiki/content/${page.id}/detail`,
    version: String(page.version),
    last_crawled_at: now.toISOString(),
    image: (existing && existing.image) || '',
  };
  Object.keys(fm).forEach((k) => fm[k] === undefined && delete fm[k]);
  return { fm, sections: [] };
}

export default transformZzzEquipment;
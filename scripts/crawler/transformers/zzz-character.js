import { stripHtml, cellText, table } from '../html.js';

const RARITY_STARS = { S: 5, A: 4 };

function talentSection(comps) {
  const blocks = [];
  for (const comp of comps) {
    const data = JSON.parse(comp.data);
    for (const tab of data.list || []) {
      blocks.push(`### ${tab.tab_name || tab.title || ''}`);
      for (const child of tab.children || []) {
        if (child.title && child.title !== tab.tab_name) blocks.push(`#### ${child.title}`);
        if (child.desc) blocks.push(stripHtml(child.desc));
        const growth = child.growth || [];
        const rows = [];
        for (const g of growth) {
          for (const c of g.children || []) {
            const cells = (c.row || []).map((r) => cellText((r || []).join(' ')));
            rows.push([g.name, c.name, cells.join(' ')]);
          }
          if (g.materials && g.materials.length) {
            rows.push([
              g.name,
              '养成材料',
              g.materials.map((m) => `${m.nickname || m.name || ''}×${m.amount ?? m.num ?? m.count ?? ''}`).join('、'),
            ]);
          }
        }
        if (rows.length) blocks.push(table(['等级', '项目', '数据'], rows));
      }
    }
  }
  return blocks.filter((b) => b && b.length).join('\n\n');
}

function doubleColSection(comp) {
  const data = JSON.parse(comp.data);
  const blocks = [];
  for (const t of data.tables || []) {
    const header = (t.header || []).map(cellText);
    const rows = (t.row || []).map((r) => r.map(cellText));
    if (rows.length) blocks.push(table(header, rows));
  }
  return blocks.join('\n\n');
}

function multiTableSection(comp) {
  const data = JSON.parse(comp.data);
  const blocks = [];
  for (const t of data.tables || []) {
    const header = (t.header || []).map(cellText);
    const rows = (t.row || []).map((r) => r.map(cellText));
    if (rows.length) blocks.push(table(header, rows));
  }
  return blocks.join('\n\n');
}

function strategySection(comp) {
  const data = JSON.parse(comp.data);
  return (data.list || [])
    .map((s) => {
      const line = `- **${s.tab_name || ''}**`;
      const detail = s.primary_summary || s.secondary_summary || '';
      const link = s.link ? `（${s.link}）` : '';
      return detail ? `${line}：${detail}${link}` : `${line}${link}`;
    })
    .join('\n');
}

function moduleHeading(name) {
  const map = {
    角色印象: '## 角色印象',
    角色CV: '## 角色CV',
    角色故事: '## 故事',
    录像店经营留言信息: '## 录像店留言',
  };
  return map[name] || `## ${name}`;
}

export function transformZzzCharacter({ page, listItem, localId, existing, now = new Date() }) {
  const f = (listItem && listItem.filters) || {};
  const shortName = (listItem && listItem.alias) || page.name;
  const fullName = (listItem && listItem.title) || page.name;
  const name = (existing && existing.name) || shortName;
  const alias = fullName !== name ? fullName : shortName !== name ? shortName : undefined;

  const baseComp = (page.modules || [])
    .flatMap((m) => m.components || [])
    .find((c) => c.component_id === 'role_base_info');
  const base = baseComp ? JSON.parse(baseComp.data) : {};
  const grade = f['稀有度'] || base.grade || '';

  const fm = {
    game: 'zzz',
    type: 'character',
    id: String(localId),
    name,
    ...(alias ? { alias } : {}),
    tags: ['zzz', 'character'],
    ...(f['特性'] ? { 特性: f['特性'] } : {}),
    ...(f['属性'] ? { 属性: f['属性'] } : {}),
    ...(f['阵营'] ? { 阵营: f['阵营'] } : {}),
    ...(grade ? { 评级: `${grade}级`, 星级: RARITY_STARS[grade] || undefined } : {}),
    source: 'mihoyo-api',
    source_url: `https://www.miyoushe.com/zzz/wiki/content/${page.id}/detail`,
    version: String(page.version),
    last_crawled_at: now.toISOString(),
    image: (existing && existing.image) || '',
  };
  Object.keys(fm).forEach((k) => fm[k] === undefined && delete fm[k]);

  const sections = [];
  const comps = [];
  const moduleNames = [];
  for (const m of page.modules || []) {
    for (const c of m.components || []) {
      comps.push(c);
      moduleNames.push(m.name || '');
    }
  }

  const richIdx = comps.findIndex((c) => c.component_id === 'rich_row_base_info');
  if (richIdx >= 0) {
    const d = JSON.parse(comps[richIdx].data);
    const text = stripHtml(d.rich_text || d.text || '');
    if (text) sections.push({ heading: '## 简介', content: text });
  }

  const talents = comps.filter((c) => c.component_id === 'role_talent');
  if (talents.length) {
    const content = talentSection(talents);
    if (content) sections.push({ heading: '## 技能', content });
  }

  comps.forEach((c, i) => {
    if (c.component_id === 'double_col_table') {
      const content = doubleColSection(c);
      if (content) {
        const data = JSON.parse(c.data);
        const header0 = ((data.tables && data.tables[0] && data.tables[0].header) || []).map(cellText).join('');
        const heading = header0.includes('影画') ? '## 影画' : `## ${header0 || '数据'}`;
        sections.push({ heading, content });
      }
    } else if (c.component_id === 'multi_table') {
      const content = multiTableSection(c);
      if (content) sections.push({ heading: '## 信赖奖励', content });
    } else if (c.component_id === 'collapse_panel') {
      const d = JSON.parse(c.data);
      const text = stripHtml(d.rich_text || '');
      if (text) sections.push({ heading: moduleHeading(moduleNames[i]), content: text });
    } else if (c.component_id === 'strategy') {
      const content = strategySection(c);
      if (content) sections.push({ heading: '## 攻略推荐', content });
    }
  });

  return { fm, sections };
}

export default transformZzzCharacter;

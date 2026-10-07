import { stripHtml, cellText, table } from '../html.js';

const STAR_MAP = { 一星: 1, 二星: 2, 三星: 3, 四星: 4, 五星: 5 };

function safeParse(x) {
  if (typeof x !== 'string') return x;
  try {
    return JSON.parse(x);
  } catch {
    return null;
  }
}

function infoSection(comp) {
  const d = safeParse(comp.data) || {};
  const rows = (d.list || []).map((x) => [cellText(x.rightKey || x.name || ''), cellText(x.rightValue || x.value || '')]);
  return rows.length ? table(['项目', '值'], rows) : '';
}

function ascensionSection(comp) {
  const d = safeParse(comp.data) || {};
  const blocks = [];
  for (const tab of d.list || []) {
    blocks.push(`### ${cellText(tab.tabName || tab.name || '')}`);
    const attrs = tab.attr || [];
    const arows = attrs.map((a) => [cellText(a.key || a.name || ''), cellText(a.value || '')]);
    if (arows.length) blocks.push(table(['属性', '值'], arows));
    const mats = tab.materials || [];
    if (mats.length) {
      blocks.push(table(['材料', '数量'], mats.map((m) => [cellText(m.name || m.title || ''), m.num ?? m.count ?? ''])));
    }
  }
  return blocks.join('\n\n');
}

function isPlaceholderTable(headers, rows) {
  if (!rows.length) return true;
  return rows.every((r) => r.every((c) => /^数值\d+$/.test(String(c).trim())));
}

function renderTableData(t) {
  const headers = (t.headers || t.header || []).map(cellText);
  const rows = (t.rows || []).map((r) =>
    r.map((c) => (typeof c === 'object' && c !== null ? cellText(c.value ?? c.text ?? '') : cellText(c))),
  );
  if (!headers.length || !rows.length) return '';
  if (isPlaceholderTable(headers, rows)) return '';
  const padded = rows.map((r) => [...r, ...Array(Math.max(0, headers.length - r.length)).fill('')].slice(0, headers.length));
  return table(headers, padded);
}

function traceSection(comp) {
  const d = safeParse(comp.data) || {};
  const blocks = [];
  for (const p of d.points || []) {
    const head = p.tag ? `${p.name}（${p.tag}）` : p.name;
    blocks.push(`### ${cellText(head || '')}`);
    const t = renderTableData(p.tableData || {});
    if (t) blocks.push(t);
    for (const sub of p.subList || []) {
      const tagline = (sub.subTag || []).filter(Boolean).map(cellText).join(' · ');
      if (tagline) blocks.push(`**${tagline}**`);
      const desc = stripHtml(sub.subDesc || '');
      if (desc) blocks.push(desc);
    }
  }
  return blocks.join('\n\n');
}

function richSection(comp) {
  const d = safeParse(comp.data) || {};
  return stripHtml(d.richText || d.rich_text || '');
}

function storySection(comp) {
  const d = safeParse(comp.data) || {};
  const blocks = [];
  for (const item of d.list || []) {
    blocks.push(`### ${cellText(item.tabName || item.name || '')}`);
    const text = stripHtml(item.desc || item.text || item.content || '');
    if (text) blocks.push(text);
    for (const det of item.detail || []) {
      const t = stripHtml(det.desc || det.text || '');
      if (t) blocks.push(`**${cellText(det.name || det.title || '')}**：${t}`);
    }
  }
  if (!blocks.length && d.text) blocks.push(stripHtml(d.text));
  return blocks.join('\n\n');
}

function voiceSection(comp) {
  const d = safeParse(comp.data) || {};
  const rows = [];
  for (const v of d.list || []) {
    for (const t of v.table || []) {
      rows.push([cellText(t.name || v.tabName || ''), cellText(t.content || t.text || '')]);
    }
    if (!(v.table || []).length) rows.push([cellText(v.tabName || v.name || ''), cellText(v.desc || v.text || '')]);
  }
  return rows.length ? table(['语音', '文本'], rows) : '';
}

function strategySection(comp) {
  const d = safeParse(comp.data) || {};
  return (d.list || [])
    .map((s) => {
      const detail = cellText(s.primary_summary || s.secondary_summary || '');
      return detail ? `- **${cellText(s.tab_name || '')}**：${detail}` : `- **${cellText(s.tab_name || '')}**`;
    })
    .join('\n');
}

const RICH_HEADINGS = {
  角色星魂: '## 星魂',
  光锥推荐: '## 光锥推荐',
  遗器推荐: '## 遗器推荐',
  配队推荐: '## 配队推荐',
};

const LIST_HEADINGS = {
  角色信息: '## 角色信息',
  角色晋阶: '## 晋阶',
  角色行迹: '## 行迹',
  角色故事: '## 故事',
  角色语音: '## 语音',
  角色关系: '## 角色关系',
  角色解析: '## 角色解析',
  角色考据: '## 角色考据',
  角色画廊: '## 角色画廊',
  角色攻略推荐: '## 攻略推荐',
};

export function transformHsrCharacter({ content, listItem, localId, existing, now = new Date() }) {
  const f = (listItem && listItem.filters) || {};
  const rpg = safeParse(content.rpg_new_tmp_content) || {};
  const base = rpg.base || {};
  const userInfo = base.userInfo || {};

  const name = (existing && existing.name) || content.title;
  const alias = content.title !== name ? content.title : undefined;

  let faction = '';
  let installDate = '';
  const infoComp = (rpg.modules || []).find((m) => (m.components || []).some((c) => c.componentId === 'character_info'));
  if (infoComp) {
    const d = safeParse(infoComp.components[0].data) || {};
    for (const x of d.list || []) {
      const k = cellText(x.rightKey || '');
      const v = cellText(x.rightValue || '');
      if (k === '阵营' && !faction) faction = v;
      if (k === '实装日期' && !installDate) installDate = v;
    }
  }

  const baseStats = {};
  const ascComp = (rpg.modules || []).find((m) => (m.components || []).some((c) => c.componentId === 'role_ascension'));
  if (ascComp) {
    const d = safeParse(ascComp.components[0].data) || {};
    const firstTab = (d.list || [])[0];
    for (const a of (firstTab && firstTab.attr) || []) {
      const k = cellText(a.key || '');
      const v = Number(a.value);
      if (['生命值', '攻击力', '防御力', '速度'].includes(k) && Number.isFinite(v)) {
        baseStats[`基础${k}`] = v;
      }
    }
  }

  const rarity = parseInt(f['星级'] || '', 10) || (userInfo.rarity ? Number(userInfo.rarity) : undefined);

  const fm = {
    game: 'hsr',
    type: 'character',
    id: String(localId),
    name,
    ...(alias ? { alias } : {}),
    tags: ['hsr', 'character'],
    ...(f['命途'] ? { 命途: f['命途'] } : {}),
    ...(f['属性'] ? { 属性: f['属性'] } : {}),
    ...(faction ? { 阵营: faction } : {}),
    ...(rarity ? { 星级: rarity } : {}),
    ...baseStats,
    source: 'mihoyo-api',
    source_url: `https://www.miyoushe.com/sr/wiki/content/${content.id}/detail`,
    version: String(content.version),
    last_crawled_at: now.toISOString(),
    image: (existing && existing.image) || '',
  };
  Object.keys(fm).forEach((k) => fm[k] === undefined && delete fm[k]);

  const sections = [];
  for (const m of rpg.modules || []) {
    const comp = (m.components || [])[0];
    if (!comp) continue;
    const name0 = m.name || '';
    if (name0 === '角色信息') {
      const c = infoSection(comp);
      if (c) sections.push({ heading: LIST_HEADINGS[name0], content: c });
    } else if (name0 === '角色晋阶') {
      const c = ascensionSection(comp);
      if (c) sections.push({ heading: LIST_HEADINGS[name0], content: c });
    } else if (name0 === '角色行迹') {
      const c = traceSection(comp);
      if (c) sections.push({ heading: LIST_HEADINGS[name0], content: c });
    } else if (RICH_HEADINGS[name0]) {
      const c = richSection(comp);
      if (c) sections.push({ heading: RICH_HEADINGS[name0], content: c });
    } else if (name0 === '角色故事') {
      const c = storySection(comp);
      if (c) sections.push({ heading: LIST_HEADINGS[name0], content: c });
    } else if (name0 === '角色语音') {
      const c = voiceSection(comp);
      if (c) sections.push({ heading: LIST_HEADINGS[name0], content: c });
    } else if (name0 === '角色攻略推荐') {
      const c = strategySection(comp);
      if (c) sections.push({ heading: LIST_HEADINGS[name0], content: c });
    } else if (LIST_HEADINGS[name0]) {
      const c = storySection(comp) || richSection(comp);
      if (c) sections.push({ heading: LIST_HEADINGS[name0], content: c });
    }
  }

  return { fm, sections };
}

export default transformHsrCharacter;

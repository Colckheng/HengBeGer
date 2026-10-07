const SITES = {
  hsr: { base: 'https://hsr.nanoka.cc', cdn: 'https://static.nanoka.cc/hsr' },
  zzz: { base: 'https://zzz.nanoka.cc', cdn: 'https://static.nanoka.cc/zzz' },
};

export const RARITY_GRADE = { 1: 'C', 2: 'B', 3: 'A', 4: 'S', 5: 'SS' };
const FRONT_BACK = { Front: '前排', Back: '后排', Both: '前后排' };
const HEAL_SHIELD = { Shield: '护盾', Healer: '治疗' };
const WEAK_ORDER = [
  ['ice', '冰'],
  ['fire', '火'],
  ['electric', '电'],
  ['ether', '以太'],
  ['physical', '物理'],
  ['wind', '风'],
];

export function parseVersion(html, site) {
  const re = new RegExp(`static\\.nanoka\\.cc/${site}/([^/"']+?)/`, 'g');
  const counts = new Map();
  let m;
  const text = String(html || '');
  while ((m = re.exec(text))) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  let best = null;
  let bestN = 0;
  for (const [v, n] of counts) {
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

export function createNanokaSource(fetcher) {
  const versions = {};
  const cache = new Map();

  function headersFor(site) {
    return { Referer: `${SITES[site].base}/` };
  }

  async function version(site) {
    if (!SITES[site]) throw new Error(`未知 nanoka 站点 ${site}`);
    if (!versions[site]) {
      const html = await fetcher.getText(`${SITES[site].base}/`, { headers: headersFor(site) });
      const v = parseVersion(html, site);
      if (!v) throw new Error(`${site} 首页未找到 static.nanoka.cc 数据版本`);
      versions[site] = v;
    }
    return versions[site];
  }

  async function getJson(site, rel, ver) {
    if (!SITES[site]) throw new Error(`未知 nanoka 站点 ${site}`);
    const v = ver || (await version(site));
    const key = `${site}|${v}|${rel}`;
    if (cache.has(key)) return cache.get(key);
    const text = await fetcher.getText(`${SITES[site].cdn}/${v}/${rel}`, { headers: headersFor(site) });
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`${site} ${rel} 返回内容不是合法 JSON`);
    }
    cache.set(key, data);
    return data;
  }

  function list(site, rel) {
    return getJson(site, rel);
  }

  function detail(site, kind, id) {
    return getJson(site, `zh/${kind}/${id}.json`);
  }

  return { version, getJson, list, detail, sites: SITES };
}

function fmtNum(v) {
  if (v === undefined || v === null) return '';
  if (Number.isInteger(v)) return String(v);
  return String(Math.round(v * 100) / 100);
}

export function fmtPct(v) {
  const x = Number(v) * 100;
  return `${fmtNum(x)}%`;
}

export function renderCurrencyDesc(desc, params = []) {
  let s = String(desc || '');
  s = s.replace(/<\/?(?:unbreak|u|color|property)[^>]*>/g, '');
  s = s.replace(/#(\d+)\[i\]/g, (_, n) => `${fmtNum(params[Number(n) - 1])}i`);
  s = s.replace(/#(\d+)\[f\]/g, (_, n) => fmtNum(params[Number(n) - 1]));
  s = s.replace(/#(\d+)(%?)/g, (_, n, pct) => `${fmtNum(params[Number(n) - 1])}${pct}`);
  return s;
}

export function normDesc(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\\n/g, '\n')
    .trim();
}

export function parseCurrencyRole(entry, traits = {}) {
  if (!entry) return null;
  const out = { name: entry.name, id: entry.id };
  if (entry.front_back_type) out['站位'] = FRONT_BACK[entry.front_back_type] || entry.front_back_type;
  if (entry.heal_or_shield_display) out['治疗护盾'] = HEAL_SHIELD[entry.heal_or_shield_display] || entry.heal_or_shield_display;
  if (entry.rarity !== undefined) {
    out['星阶'] = entry.rarity;
    out['星级'] = entry.rarity;
  }
  const names = (entry.trait_list || []).map((id) => (traits[id] ? traits[id].name : null)).filter(Boolean);
  if (names.length) out['特性'] = names.join('、');
  return out;
}

export function parseCurrencyTrait(entry) {
  if (!entry) return null;
  return { name: entry.name, id: entry.id };
}

export function parseCurrencyItem(entry) {
  if (!entry) return null;
  const out = { 名称: entry.name };
  if (entry.type) out['类型'] = entry.type;
  if (entry.desc !== undefined) out['描述'] = normDesc(entry.desc);
  return out;
}

export function parseCurrencyAugment(entry) {
  if (!entry) return null;
  const out = { 名称: entry.name };
  if (entry.quality) out['品质'] = entry.quality;
  if (entry.desc !== undefined) out['说明'] = renderCurrencyDesc(entry.desc, entry.param_list);
  return out;
}

export function parseCurrencyBuff(entry) {
  if (!entry) return null;
  const out = { 名称: entry.name };
  if (entry.desc !== undefined) out['说明'] = renderCurrencyDesc(entry.desc, entry.param_list);
  const rels = [];
  for (const b of Object.values(entry.bonus || {})) rels.push(...(b.combination_bonus_list || []));
  if (rels.length) out['关联'] = rels.join('、');
  return out;
}

export function parseZzzMonster(detail, lv = 70) {
  if (!detail) return null;
  const out = { id: detail.id, name: detail.name };
  if (detail.group_desc) out['阵营'] = detail.group_desc;
  if (detail.rarity !== undefined && RARITY_GRADE[detail.rarity]) out['评级'] = RARITY_GRADE[detail.rarity];
  const first = Object.values(detail.monster_info || {})[0];
  if (first) {
    const weak = WEAK_ORDER.filter(([k]) => first.element && first.element[k]).map(([, zh]) => zh);
    if (weak.length) out['弱点'] = weak.join('、');
    const pairs = [
      ['hp', '生命值'],
      ['attack', '攻击力'],
      ['defence', '防御力'],
      ['stun', '冲击力'],
    ];
    for (const [stat, field] of pairs) {
      const c = first.curves && first.curves[stat];
      const base = first.stats && first.stats[stat];
      if (c && Array.isArray(c.curve) && base !== undefined && c.curve[lv - 1] !== undefined) {
        out[field] = Math.floor((base * c.curve[lv - 1]) / (c.ratio || 100));
      }
    }
  }
  return out;
}

export function parseZzzBoss(listEntry, id) {
  if (!listEntry) return null;
  const out = { id, name: listEntry.zh };
  if (listEntry.live_begin) out['开始'] = listEntry.live_begin;
  if (listEntry.live_end) out['结束'] = String(listEntry.live_end).slice(0, 10);
  return out;
}

export function renderHsrSkillParams(skill, lvKey) {
  const lvl = skill && skill.level && skill.level[lvKey];
  if (!lvl) return [];
  const params = lvl.param_list || [];
  const seen = new Set();
  const out = [];
  const re = /#(\d+)(?:\[i\]|\[f\])?(%?)/g;
  let m;
  while ((m = re.exec(String(skill.desc || '')))) {
    const n = Number(m[1]);
    if (seen.has(n)) continue;
    seen.add(n);
    const v = params[n - 1];
    if (v === undefined || v === null) continue;
    out.push(m[2] === '%' ? fmtPct(v) : fmtNum(v));
  }
  return out;
}

export function parseHsrSkillTables(md) {
  const text = String(md || '');
  const start = text.indexOf('## 行迹');
  if (start === -1) return {};
  const end = text.indexOf('\n## ', start + 1);
  const section = end === -1 ? text.slice(start) : text.slice(start, end);
  const out = {};
  let cur = null;
  for (const line of section.split('\n')) {
    const h = /^### (.+?)（(.+)）\s*$/.exec(line);
    if (h) {
      cur = { name: h[1], type: h[2], levels: [] };
      out[h[1]] = cur;
      continue;
    }
    if (!cur) continue;
    const row = /^\| 等级(\d+) \| (.+?) \|\s*$/.exec(line);
    if (row) cur.levels.push({ level: Number(row[1]), cells: row[2].split('|').map((c) => c.trim()) });
  }
  for (const v of Object.values(out)) v.max = v.levels.length ? Math.max(...v.levels.map((l) => l.level)) : 0;
  return out;
}

export function parseZzzSkillSource(detail) {
  const basic = detail && detail.skill && detail.skill.basic;
  if (!basic || !Array.isArray(basic.description)) return null;
  const block = basic.description.find((e) => Array.isArray(e.param) && e.param.length && e.param[0].name === '一段伤害倍率');
  if (!block) return null;
  const p = block.param[0];
  const box = Object.values(p.param || {})[0] || {};
  return {
    name: block.name,
    damage: box.damage_percentage !== undefined ? box.damage_percentage : box.main,
    damageGrowth: box.damage_percentage_growth !== undefined ? box.damage_percentage_growth : box.growth,
    stun: box.stun_ratio,
    stunGrowth: box.stun_ratio_growth,
  };
}

export function zzzSkillValueAt(base, growth, lv) {
  if (base === undefined || base === null) return null;
  return base + (growth || 0) * (lv - 1);
}

export function parseZzzAgentSkill(md) {
  const text = String(md || '');
  const start = text.indexOf('## 技能');
  if (start === -1) return null;
  const end = text.indexOf('\n## ', start + 1);
  const section = end === -1 ? text.slice(start) : text.slice(start, end);
  const damage = [];
  const stun = [];
  let lastLevel = 0;
  for (const line of section.split('\n')) {
    const d = /^\| (\d+) \| 伤害倍率 \| (.+?) \|\s*$/.exec(line);
    if (d) {
      const lv = Number(d[1]);
      if (damage.length && lv <= lastLevel) break;
      lastLevel = lv;
      damage.push({ level: lv, text: d[2] });
      continue;
    }
    const s = /^\| (\d+) \| 失衡倍率 \| (.+?) \|\s*$/.exec(line);
    if (s && damage.length) stun.push({ level: Number(s[1]), text: s[2] });
  }
  if (!damage.length) return null;
  const firstDamage = (damage[0].text.match(/一段伤害倍率：([\d.]+%)/) || [])[1] || '';
  const lastDamage = (damage[damage.length - 1].text.match(/一段伤害倍率：([\d.]+%)/) || [])[1] || '';
  const firstStun = stun.length ? (stun[0].text.match(/一段失衡倍率：([\d.]+%)/) || [])[1] || '' : '';
  const secondDamage = damage.length > 1 ? (damage[1].text.match(/一段伤害倍率：([\d.]+%)/) || [])[1] || '' : '';
  return {
    max: damage[damage.length - 1].level,
    lv1: firstDamage,
    lv2: secondDamage,
    lvLast: lastDamage,
    stunLv1: firstStun,
  };
}

export default createNanokaSource;

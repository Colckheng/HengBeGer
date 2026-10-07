const BASE = 'https://zzz.gg';

export function createZzzggSource(fetcher, opts = {}) {
  const headers = { Referer: `${BASE}/zh-hans/characters`, ...(opts.headers || {}) };

  async function getCharacter(title) {
    return fetcher.getText(`${BASE}/zh-hans/characters/${encodeURIComponent(title)}`, { headers });
  }

  return { getCharacter, base: BASE };
}

const ELEMENTS = new Set(['物理', '火', '电', '冰', '风', '以太']);
const ROLES = new Set(['强攻', '异常', '击破', '支援', '防护']);

function clean(s) {
  return String(s)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseCharacter(html) {
  const out = {};
  const h1 = /<h1[^>]*>([^<]+)<\/h1>/.exec(html);
  if (h1) out.alias = clean(h1[1]);
  const fac = /class="intro-faction"[^>]*>([^<]+)</.exec(html);
  if (fac) out['阵营'] = clean(fac[1]);
  const tags = [...html.matchAll(/<div class="tag">[\s\S]{0,600}?<div class="name">([^<]+)<\/div>/g)].map((m) => clean(m[1]));
  const attr = tags.find((t) => ELEMENTS.has(t));
  if (attr) out['属性'] = attr;
  const role = tags.find((t) => ROLES.has(t));
  if (role) out['特性'] = role;
  return out;
}

export default createZzzggSource;

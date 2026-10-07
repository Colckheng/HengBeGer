const BASE = 'https://starrailstation.com';

export function createSrsSource(fetcher, opts = {}) {
  const headers = { Referer: `${BASE}/cn/characters`, ...(opts.headers || {}) };

  async function getList() {
    return fetcher.getText(`${BASE}/cn/characters`, { headers });
  }

  async function getCharacter(slug) {
    return fetcher.getText(`${BASE}/cn/character/${encodeURIComponent(slug)}`, { headers });
  }

  return { getList, getCharacter, base: BASE };
}

const BLOCK_RE = /<a class="a7916" style="display:flex" href="(\/cn\/character\/[^"]+)">([\s\S]*?)<\/a>/g;

export function findSlug(listHtml, title, path) {
  const target = String(title || '').trim();
  if (!target) return null;
  const hits = [];
  BLOCK_RE.lastIndex = 0;
  let m;
  while ((m = BLOCK_RE.exec(listHtml))) {
    const block = m[2];
    const name = (block.match(/ellipsis">([^<]+)</) || [])[1];
    if (!name || name.trim() !== target) continue;
    hits.push({ slug: decodeURIComponent(m[1].split('/').pop()), block });
  }
  if (!hits.length) return null;
  const narrowed = path ? hits.filter((h) => h.block.includes(`alt="${path}"`)) : [];
  const pool = narrowed.length ? narrowed : hits;
  const plain = pool.find((h) => !/\d$/.test(h.slug));
  return (plain || pool[0]).slug;
}

export function parseCharacter(html) {
  const out = {};
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
  if (h1) out.alias = h1[1].replace(/<[^>]+>/g, '').trim();
  const meta = /"name":"([^"]+)","rarity":(\d+),"descHash"/.exec(html);
  if (meta) {
    out.alias = meta[1];
    out['星级'] = Number(meta[2]);
  }
  const pair = /"damageType":\{[^{}]*"name":"([^"]+)"[^{}]*\}\s*,\s*"baseType":\{[^{}]*"name":"([^"]+)"[^{}]*\}/.exec(html);
  if (pair) {
    out['属性'] = pair[1];
    out['命途'] = pair[2];
  }
  return out;
}

export default createSrsSource;

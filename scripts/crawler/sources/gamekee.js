const CDN_BASE = 'https://api-cdn.gamekee.com/wiki2.0/pro';
const API_BASE = 'https://www.gamekee.com';

function edText(ed) {
  const out = [];
  const walk = (n) => {
    if (!n) return;
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (typeof n !== 'object') return;
    if (n.text) out.push(n.text);
    if (n.type === 'image' && n.src) out.push(`[img:${n.src}]`);
    if (Array.isArray(n.children)) walk(n.children);
  };
  walk(ed && ed.data);
  return out.join('');
}

export function createGameKeeSource(fetcher, opts = {}) {
  const gameId = String(opts.gameId || 50270);
  const headers = { Referer: 'https://www.gamekee.com/', 'game-id': gameId, ...(opts.headers || {}) };

  return {
    gameId,
    async getEntryList() {
      return fetcher.getJson(`${CDN_BASE}/${gameId}/entry/list.json`, { headers });
    },
    async getTreesByPid(pid) {
      const j = await fetcher.getJson(`${API_BASE}/v1/entry/treesByPid?pid=${encodeURIComponent(pid)}`, { headers });
      return (j && j.data) || [];
    },
    async getPageList({ entryId, page = 1, pageSize = 20 } = {}) {
      const j = await fetcher.getJson(
        `${API_BASE}/v1/content/pageList?entry_id=${encodeURIComponent(entryId)}&page=${page}&page_size=${pageSize}`,
        { headers },
      );
      return (j && j.data) || [];
    },
    async getContentDetail(contentId) {
      const j = await fetcher.getJson(`${API_BASE}/v1/content/detail/${encodeURIComponent(contentId)}`, { headers });
      return (j && j.data) || null;
    },
  };
}

export function findCategory(tree, path) {
  let list = Array.isArray(tree) ? tree : [];
  let node = null;
  for (const name of path) {
    node = (list || []).find((n) => n.name === name);
    if (!node) return null;
    list = node.child;
  }
  return node;
}

export function extractProfile(input) {
  let blocks = input;
  if (typeof input === 'string') {
    try {
      blocks = JSON.parse(input);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(blocks)) return null;
  for (const b of blocks) {
    if (b.type !== 'illustrated-book' || !Array.isArray(b.data)) continue;
    for (const sub of b.data) {
      const d = sub.data || {};
      if (!d.name && !d.attrList) continue;
      const attrs = {};
      for (const a of d.attrList || []) {
        const k = edText(a.title).trim();
        const v = edText(a.content)
          .replace(/\[img:[^\]]*\]/g, '')
          .trim();
        if (k && v && !(k in attrs)) attrs[k] = v;
      }
      const images = [];
      for (const im of d.imageList || []) {
        const src = typeof im === 'string' ? im : (im && (im.src || (im.data && im.data.src))) || '';
        if (src) images.push(src);
      }
      return { name: edText(d.name).trim(), desc: edText(d.desc).trim(), attrs, images };
    }
  }
  return null;
}

export function mapGkAgentFields(profile) {
  const out = {};
  if (!profile) return out;
  if (profile.name) out.alias = profile.name.replace(/（[^）]*）/g, '').trim();
  const a = profile.attrs || {};
  if (a['阵营']) out['阵营'] = a['阵营'];
  if (a['属性']) out['属性'] = String(a['属性']).replace(/属性$/, '').trim();
  if (a['标签']) out['特性'] = a['标签'];
  return out;
}

export function mapGkWeaponFields(profile) {
  const out = {};
  if (!profile) return out;
  if (profile.name) out.alias = profile.name;
  const a = profile.attrs || {};
  if (a['基础攻击力']) out['基础攻击力'] = a['基础攻击力'];
  return out;
}

export default createGameKeeSource;

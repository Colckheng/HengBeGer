const BASE = 'https://sr.appfeng.com';

export function createAppfengSource(fetcher, opts = {}) {
  const headers = { Referer: `${BASE}/`, ...(opts.headers || {}) };

  async function getMonster(id) {
    return fetcher.getText(`${BASE}/monster/${encodeURIComponent(id)}`, { headers });
  }

  return { getMonster, base: BASE };
}

const RATING_MAP = { '小怪': 'Minion', '精英': 'Elite', '小BOSS': 'Little Boss', '大BOSS': 'Big Boss', 'BOSS': 'Big Boss' };

export function normRating(raw) {
  const m = /^(小怪|精英|小BOSS|大BOSS|BOSS)(?:\s*Lv\.?\s*(\d+))?$/i.exec(String(raw || '').trim());
  if (!m) return String(raw || '').trim();
  const base = RATING_MAP[m[1]] || m[1];
  return m[2] ? `${base} Lv.${m[2]}` : base;
}

function clean(s) {
  return String(s)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseMonster(html) {
  const out = {};
  const h1 = /<h1 class="listhead__t"[^>]*>([^<]+)<\/h1>/.exec(html);
  if (h1) out.alias = clean(h1[1]);
  const kicker = /class="listhead__kicker[^"]*"[^>]*>([^<]+)</.exec(html);
  const rawKicker = kicker ? clean(kicker[1]) : '';
  if (rawKicker) out['评级'] = normRating(rawKicker);
  const chips = [...html.matchAll(/<span class="chip[^"]*"[^>]*>([^<]+)<\/span>/g)].map((m) => clean(m[1]));
  const faction = chips.find((c) => c && c !== rawKicker);
  if (faction) out['阵营'] = faction;
  const weak = [...html.matchAll(/class="weak__i"[^>]*>[\s\S]{0,400}?<b[^>]*>([^<]+)<\/b>/g)].map((m) => clean(m[1]));
  if (weak.length) out['弱点'] = weak.join(' / ');
  return out;
}

export default createAppfengSource;

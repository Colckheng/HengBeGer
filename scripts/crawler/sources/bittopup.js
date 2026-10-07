const BASE = 'https://wiki.bittopup.com';

export function createBittopupSource(fetcher, opts = {}) {
  const headers = { Referer: `${BASE}/zh-CN/starrail`, ...(opts.headers || {}) };

  async function getBannerPage() {
    return fetcher.getText(`${BASE}/zh-CN/starrail/banner`, { headers });
  }

  return { getBannerPage, base: BASE };
}

function pick(data, v) {
  return typeof v === 'number' ? data[v] : v;
}

function toItem(data, v) {
  const it = pick(data, v);
  if (!it || typeof it !== 'object') return null;
  const name = pick(data, it.name);
  if (!name) return null;
  return { id: pick(data, it.id) ?? null, name: String(name) };
}

export function parseBannerPayload(html) {
  const marker = 'id="__NUXT_DATA__">';
  const at = html.indexOf(marker);
  if (at === -1) return [];
  const start = at + marker.length;
  const end = html.indexOf('</script>', start);
  if (end === -1) return [];
  let data;
  try {
    data = JSON.parse(html.slice(start, end));
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  let list = null;
  for (const el of data) {
    if (!el || typeof el !== 'object' || Array.isArray(el)) continue;
    const keys = Object.keys(el);
    if (keys.length !== 1 || keys[0] !== 'starrail-banners-chs') continue;
    const wrap = pick(data, el['starrail-banners-chs']);
    if (!wrap || typeof wrap !== 'object' || Array.isArray(wrap)) continue;
    const wKeys = Object.keys(wrap);
    if (wKeys.length !== 1 || wKeys[0] !== 'banners') continue;
    const arr = pick(data, wrap.banners);
    if (Array.isArray(arr)) {
      list = arr;
      break;
    }
  }
  if (!list) return [];

  const banners = [];
  for (const ref of list) {
    const b = pick(data, ref);
    if (!b || typeof b !== 'object') continue;
    const version = pick(data, b.V);
    const phasesRaw = pick(data, b.P);
    if (!version || !Array.isArray(phasesRaw)) continue;
    const phases = [];
    for (const raw of phasesRaw) {
      const p = pick(data, raw);
      if (!p || typeof p !== 'object') continue;
      const names = (key) => {
        const arr = pick(data, p[key]);
        if (!Array.isArray(arr)) return [];
        return arr.map((it) => toItem(data, it)).filter(Boolean);
      };
      phases.push({
        start: String(pick(data, p.start) || ''),
        end: String(pick(data, p.end) || ''),
        characters: names('characters_5').concat(names('characters_4')),
        lightcones: names('lightcones_5').concat(names('lightcones_4')),
      });
    }
    phases.sort((a, b2) => String(a.start).localeCompare(String(b2.start)));
    phases.forEach((ph, i) => {
      ph.half = phases.length > 1 ? (i === 0 ? '上半' : i === 1 ? '下半' : '') : '';
    });
    banners.push({ version: String(version), phases });
  }
  return banners.filter((b) => b.version && b.phases.length);
}

function toTime(s) {
  const m = /(\d{4})[-/](\d{2})[-/](\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(String(s || ''));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0));
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function matchPoolVersion(pool, banners) {
  const pStart = toTime(pool.start);
  if (!pStart) return null;
  const pEnd = toTime(pool.end);
  const ups = new Set((pool.ups || []).map((s) => String(s).trim()).filter(Boolean));
  let best = null;
  let bestScore = 0;
  for (const b of banners) {
    for (const ph of b.phases) {
      const s = toTime(ph.start);
      if (!s) continue;
      const e = /\d/.test(ph.end) ? toTime(ph.end) : null;
      const sameStart = sameDay(pStart, s);
      const dayDiff = Math.abs(pStart - s) / 86400000;
      const phaseNames = new Set([...ph.characters, ...ph.lightcones].map((x) => x.name));
      let hits = 0;
      for (const name of ups) if (phaseNames.has(name)) hits += 1;
      const nearStart = dayDiff <= 7;
      if (!sameStart && !(nearStart && hits > 0)) continue;
      const inWindow = (e ? pStart <= e : true) && (pEnd ? pEnd >= s : true);
      const score = (sameStart ? 4 : 0) + (nearStart ? 1 : 0) + (inWindow ? 1 : 0) + hits * 3;
      if (score > bestScore) {
        bestScore = score;
        best = { version: b.version, half: ph.half };
      }
    }
  }
  return best;
}

export default createBittopupSource;

const BASE = 'https://wiki.biligame.com';

export { compareFields } from '../compare.js';

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const TAG_RE = /<!--[\s\S]*?-->|<\s*(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;

function decodeEntities(s) {
  return String(s)
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/gi, '&');
}

function cleanText(s) {
  return decodeEntities(s)
    .replace(/\[\d+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseWikiTables(html) {
  const tables = [];
  const stack = [];
  let skip = null;
  let lastIndex = 0;

  const closeCell = (t) => {
    if (!t.curCell) return;
    if (!t.curRow) t.curRow = [];
    t.curRow.push({ tag: t.curCell.tag, text: cleanText(t.curCell.text.join('')), colSpan: t.curCell.colSpan });
    t.curCell = null;
  };
  const closeRow = (t) => {
    closeCell(t);
    if (t.curRow) {
      t.rows.push(t.curRow);
      t.curRow = null;
    }
  };
  const feedText = (s) => {
    if (skip || !s) return;
    const top = stack[stack.length - 1];
    if (top && top.curCell) top.curCell.text.push(s);
  };

  TAG_RE.lastIndex = 0;
  let m;
  while ((m = TAG_RE.exec(html))) {
    feedText(html.slice(lastIndex, m.index));
    lastIndex = TAG_RE.lastIndex;
    if (m[0].startsWith('<!--')) continue;
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    const attrs = m[3] || '';
    if (skip) {
      if (closing && name === skip) skip = null;
      continue;
    }
    if (!closing && (name === 'style' || name === 'script')) {
      skip = name;
      continue;
    }
    const top = stack[stack.length - 1];
    if (closing) {
      if (name === 'table') {
        if (top) closeRow(top);
        stack.pop();
      } else if (name === 'tr' && top) {
        closeRow(top);
      } else if ((name === 'th' || name === 'td') && top) {
        closeCell(top);
      }
      continue;
    }
    const selfClose = /\/\s*$/.test(attrs) || VOID_TAGS.has(name);
    if (name === 'table') {
      const t = { rows: [], curRow: null, curCell: null };
      tables.push(t);
      stack.push(t);
    } else if (name === 'tr' && top) {
      closeRow(top);
      top.curRow = [];
    } else if ((name === 'th' || name === 'td') && top) {
      if (top.curCell) closeCell(top);
      if (!top.curRow) top.curRow = [];
      const cs = /\bcolspan\s*=\s*["']?(\d+)/i.exec(attrs);
      top.curCell = { tag: name, text: [], colSpan: cs ? Number(cs[1]) : 1 };
    } else if (selfClose) {
      continue;
    }
  }
  feedText(html.slice(lastIndex));
  while (stack.length) closeRow(stack.pop());
  return tables;
}

function rowCells(row) {
  return row;
}

export function createBwikiSource(fetcher, opts = {}) {
  const headers = (wiki) => ({ Referer: `${BASE}/${wiki}/`, ...(opts.headers || {}) });
  const apiUrl = (wiki, page) => `${BASE}/${wiki}/api.php?action=parse&page=${encodeURIComponent(page)}&prop=text&format=json&redirects=1`;

  async function getPage(wiki, title) {
    const j = await fetcher.getJson(apiUrl(wiki, title), { headers: headers(wiki) });
    let html = j.parse && j.parse.text && j.parse.text['*'];
    if (!html) throw new Error(`bwiki ${wiki}/${title} parse failed`);
    if (html.includes('redirectMsg')) {
      const at = html.indexOf('redirectMsg');
      const tag = /<a\b[^>]*>/i.exec(html.slice(at));
      if (!tag) throw new Error(`bwiki ${wiki}/${title} redirect target not found`);
      const attrs = {};
      const re = /([\w-]+)\s*=\s*"([^"]*)"/g;
      let am;
      while ((am = re.exec(tag[0]))) attrs[am[1].toLowerCase()] = am[2];
      const target = attrs.title || (attrs.href ? decodeURIComponent(attrs.href.split('/').pop()) : '');
      if (!target) throw new Error(`bwiki ${wiki}/${title} redirect target not found`);
      const j2 = await fetcher.getJson(apiUrl(wiki, target), { headers: headers(wiki) });
      html = j2.parse && j2.parse.text && j2.parse.text['*'];
      if (!html) throw new Error(`bwiki ${wiki}/${target} parse failed`);
      return { html, title: (j2.parse && j2.parse.title) || target };
    }
    return { html, title: (j.parse && j.parse.title) || title };
  }

  return { getPage, base: BASE };
}

export function parseInfobox(html) {
  const tables = parseWikiTables(html);
  const table = tables.find((t) => t.rows.some((r) => rowCells(r).some((c) => c.tag === 'th')));
  const out = {};
  if (!table) return out;
  for (const row of table.rows) {
    const cells = rowCells(row);
    for (let i = 0; i < cells.length - 1; i += 1) {
      if (cells[i].tag !== 'TH' && cells[i].tag !== 'th') continue;
      if (cells[i + 1].tag !== 'TD' && cells[i + 1].tag !== 'td') continue;
      const key = cells[i].text;
      const val = cells[i + 1].text;
      if (key && val && !(key in out)) out[key] = val;
    }
  }
  return out;
}

export function mapZzzFields(infobox) {
  const out = {};
  const full = infobox['全名/本名'];
  if (full) out.alias = full.replace(/（[^）]*）/g, '').trim();
  if (infobox['阵营']) out['阵营'] = infobox['阵营'];
  if (infobox['属性']) out['属性'] = infobox['属性'];
  if (infobox['特性']) out['特性'] = infobox['特性'];
  if (infobox['伤害类型']) out['攻击方式'] = infobox['伤害类型'];
  return out;
}

export function mapHsrFields(infobox) {
  const out = {};
  const full = infobox['全名/本名'];
  if (full) out.alias = full.replace(/（[^）]*）/g, '').trim();
  if (infobox['命途']) out['命途'] = String(infobox['命途']).replace(/命途$/, '');
  if (infobox['战斗属性']) out['属性'] = String(infobox['战斗属性']).replace(/战斗属性$/, '');
  if (infobox['阵营']) out['阵营'] = infobox['阵营'];
  return out;
}

export function parseGachaPeriods(html) {
  const periods = [];
  let cur = null;
  for (const table of parseWikiTables(html)) {
    for (const row of table.rows) {
      const cells = rowCells(row);
      const th = cells.find((c) => c.tag === 'th');
      const td = cells.find((c) => c.tag === 'td');
      if (!th) continue;
      if (th.colSpan >= 2 && !td) {
        if (cur) periods.push(cur);
        cur = { title: th.text, time: '', version: '', ups: {} };
        continue;
      }
      if (!cur || !th || !td) continue;
      const key = th.text;
      const val = td.text;
      if (key === '时间') cur.time = val;
      else if (key === '版本') cur.version = val;
      else if (/^[SA]级/.test(key)) cur.ups[key] = val;
    }
  }
  if (cur) periods.push(cur);
  return periods.filter((p) => p.time && p.version);
}

export function endDate(isoLike) {
  const s = String(isoLike || '')
    .trim()
    .replace(/\//g, '-');
  return s.length >= 10 ? s.slice(0, 10) : '';
}

export function matchGachaPeriod(start, end, periods) {
  const endKey = endDate(end);
  const startKey = endDate(start);
  const candidates = periods.filter((p) => {
    const parts = p.time.split('~');
    const pEnd = endDate(parts[1]);
    const pStart = endDate(parts[0]);
    if (endKey && pEnd === endKey) {
      if (!pStart || !/\d{4}-\d{2}-\d{2}/.test(pStart)) return true;
      return !startKey || pStart === startKey;
    }
    return false;
  });
  return candidates[0] || null;
}

export default createBwikiSource;

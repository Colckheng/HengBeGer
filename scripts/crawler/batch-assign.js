import fs from 'node:fs';
import path from 'node:path';
import { splitFrontMatter } from './schema.js';
import { normalizeName } from './writer.js';

const TIER_EXACT = 1000;
const TIER_PREFIX = 800;
const TIER_CONTAINS = 600;
const MIN_NAME_TIER = TIER_CONTAINS;
const LINK_SCORE = 10000;
const FILTER_BONUS = 50;

export function fmContentId(fm) {
  const url = fm && fm.source_url;
  const m = url ? /\/content\/(\d+)\//.exec(String(url)) : null;
  return m ? Number(m[1]) : null;
}

export function listCandidates(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md') && f !== '_index.md').sort()) {
    const raw = fs.readFileSync(path.join(dir, file), 'utf8');
    const { data } = splitFrontMatter(raw);
    const base = file.replace(/\.md$/, '');
    const names = [data && data.name, data && data.alias, base.replace(/^\d+_/, '')]
      .map(normalizeName)
      .filter(Boolean);
    out.push({ file, path: path.join(dir, file), data: data || {}, names });
  }
  return out;
}

function scoreItem(item, cand) {
  let score = 0;
  const link = fmContentId(cand.data);
  if (link !== null && Number(item.content_id) === link) score += LINK_SCORE;
  let tier = 0;
  for (const raw of [item.title, item.alias]) {
    const target = normalizeName(raw);
    if (!target) continue;
    if (cand.names.includes(target)) tier = Math.max(tier, TIER_EXACT);
    else if (cand.names.some((n) => n.length >= 2 && target.startsWith(n))) tier = Math.max(tier, TIER_PREFIX);
    else if (cand.names.some((n) => n.length >= 2 && target.includes(n))) tier = Math.max(tier, TIER_CONTAINS);
  }
  score += tier;
  for (const [k, v] of Object.entries(item.filters || {})) {
    const fv = cand.data[k];
    if (fv !== undefined && fv !== null && fv !== '' && normalizeName(v) === normalizeName(fv)) score += FILTER_BONUS;
  }
  return score;
}

export function assignItemsToFiles(items, candidates) {
  const claimed = new Set();
  const assignments = new Map();
  const ordered = [...items].sort((a, b) => Number(a.content_id) - Number(b.content_id));
  for (const item of ordered) {
    let best = null;
    let bestScore = -1;
    for (const cand of candidates) {
      if (claimed.has(cand.file)) continue;
      const s = scoreItem(item, cand);
      if (s > bestScore) {
        bestScore = s;
        best = cand;
      }
    }
    const ok = best && bestScore >= MIN_NAME_TIER;
    assignments.set(String(item.content_id), ok ? best : null);
    if (ok) claimed.add(best.file);
  }
  const orphans = candidates.filter((c) => !claimed.has(c.file)).map((c) => c.file);
  return { assignments, orphans };
}

export function resolveBatchDir(items, dir) {
  const candidates = listCandidates(dir);
  const { assignments, orphans } = assignItemsToFiles(items, candidates);
  const paths = new Map();
  for (const [cid, cand] of assignments) paths.set(cid, cand ? cand.path : null);
  return { assignments: paths, orphans };
}

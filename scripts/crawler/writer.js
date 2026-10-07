import fs from 'node:fs';
import path from 'node:path';
import { splitFrontMatter, validateFile } from './schema.js';

const WORD = /^[\w-]+$/;

function dumpScalar(v) {
  if (Array.isArray(v)) {
    return `[${v.map((x) => (WORD.test(String(x)) ? String(x) : JSON.stringify(String(x)))).join(', ')}]`;
  }
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return String(v);
  return JSON.stringify(String(v));
}

export function renderDoc(fm, sections, preamble = '') {
  const lines = Object.entries(fm)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}: ${dumpScalar(v)}`);
  const parts = [];
  if (preamble && preamble.trim()) parts.push(preamble.trim());
  for (const s of sections) parts.push(`${s.heading}\n\n${s.content.trim()}`);
  return `---\n${lines.join('\n')}\n---\n\n${parts.join('\n\n')}\n`;
}

export function splitSections(body) {
  const lines = String(body || '').split('\n');
  const preamble = [];
  const sections = [];
  let cur = null;
  for (const line of lines) {
    const m = /^##\s+(.*)$/.exec(line);
    if (m) {
      if (cur) sections.push(cur);
      cur = { heading: `## ${m[1].trim()}`, lines: [] };
    } else if (cur) {
      cur.lines.push(line);
    } else {
      preamble.push(line);
    }
  }
  if (cur) sections.push(cur);
  return { preamble: preamble.join('\n').trim(), sections };
}

export function mergeBodies(newPreamble, newSections, oldBody) {
  const old = splitSections(oldBody);
  const newHeads = new Set(newSections.map((s) => s.heading));
  const kept = old.sections.filter((s) => !newHeads.has(s.heading));
  const parts = [newPreamble];
  for (const s of newSections) parts.push(`${s.heading}\n\n${s.content.trim()}`);
  for (const s of kept) parts.push(`${s.heading}\n\n${s.lines.join('\n').trim()}`);
  return `${parts.filter(Boolean).join('\n\n')}\n`;
}

export function normalizeName(s) {
  return String(s || '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();
}

export function findExistingFile(dirPath, targetNames) {
  if (!fs.existsSync(dirPath)) return null;
  const targets = [...new Set((Array.isArray(targetNames) ? targetNames : [targetNames]).map(normalizeName).filter(Boolean))];
  const files = fs
    .readdirSync(dirPath)
    .filter((f) => f.endsWith('.md') && f !== '_index.md');
  const candidates = [];
  for (const f of files) {
    const raw = fs.readFileSync(path.join(dirPath, f), 'utf8');
    const { data } = splitFrontMatter(raw);
    const base = f.replace(/\.md$/, '');
    const names = [(data && data.name), (data && data.alias), base.replace(/^\d+_/, '')].map(normalizeName).filter(Boolean);
    candidates.push({ file: f, names });
  }
  for (const target of targets) {
    const exact = candidates.filter((c) => c.names.includes(target));
    if (exact.length) return path.join(dirPath, exact[0].file);
    const prefix = candidates.filter((c) => c.names.some((n) => n.length >= 2 && target.startsWith(n)));
    if (prefix.length) return path.join(dirPath, prefix.sort((a, b) => Math.max(...b.names.map((n) => n.length)) - Math.max(...a.names.map((n) => n.length)))[0].file);
    const contains = candidates.filter((c) => c.names.some((n) => n.length >= 2 && target.includes(n)));
    if (contains.length) return path.join(dirPath, contains[0].file);
  }
  return null;
}

export function mergeFm(existingFm, incomingFm) {
  const tags = [...new Set([...(existingFm.tags || []), ...(incomingFm.tags || [])])];
  const merged = { ...existingFm, ...incomingFm, tags };
  for (const [k, v] of Object.entries(incomingFm)) {
    if (v === undefined || v === null) delete merged[k];
  }
  return merged;
}

export function sanitizeFilename(name) {
  return String(name || '').replace(/[\\/:*?"<>|]/g, '');
}

export function writeEntityFile(dirPath, filename, fm, body) {
  fs.mkdirSync(dirPath, { recursive: true });
  const filePath = path.join(dirPath, filename);
  fs.writeFileSync(filePath, body, 'utf8');
  return filePath;
}

export function readEntityFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const { data, body } = splitFrontMatter(raw);
  return { fm: data, body, raw };
}

export function validateRendered(text) {
  return validateFile(text);
}

export function stripCrawlTime(text) {
  return String(text).replace(/^last_crawled_at:.*$/m, 'last_crawled_at: -');
}

export function isUnchangedText(prevRaw, text) {
  if (prevRaw === undefined || prevRaw === null) return false;
  return stripCrawlTime(text) === stripCrawlTime(prevRaw);
}

export function touchState(dirPath, patch = {}) {
  const statePath = path.join(dirPath, 'state.json');
  let state = {};
  if (fs.existsSync(statePath)) {
    try {
      state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    } catch {
      state = {};
    }
  }
  const next = {
    ...state,
    last_crawled_at: patch.last_crawled_at || new Date().toISOString(),
    primary_source: patch.primary_source || state.primary_source || 'mihoyo-api',
    ...patch,
  };
  fs.writeFileSync(statePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

export default {
  renderDoc,
  splitSections,
  mergeBodies,
  findExistingFile,
  mergeFm,
  sanitizeFilename,
  writeEntityFile,
  readEntityFile,
  validateRendered,
  stripCrawlTime,
  isUnchangedText,
  touchState,
  normalizeName,
};

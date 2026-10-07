import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { splitFrontMatter } from './schema.js';

const SKIP_DIRS = new Set(['node_modules', '.git', 'images']);

export function snapshot(root) {
  const map = new Map();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name));
        continue;
      }
      if (!entry.name.endsWith('.md') && !entry.name.endsWith('.json')) continue;
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs).replace(/\\/g, '/');
      const content = fs.readFileSync(abs, 'utf8');
      map.set(rel, { hash: crypto.createHash('sha256').update(content).digest('hex'), content });
    }
  };
  walk(root);
  return map;
}

export function diffSnapshots(a, b) {
  const added = [];
  const modified = [];
  const deleted = [];
  for (const [rel, entry] of b) {
    if (!a.has(rel)) added.push(rel);
    else if (a.get(rel).hash !== entry.hash) modified.push(rel);
  }
  for (const rel of a.keys()) {
    if (!b.has(rel)) deleted.push(rel);
  }
  added.sort();
  modified.sort();
  deleted.sort();
  return { added, modified, deleted };
}

export function diffFileContent(oldText, newText) {
  const oldPart = splitFrontMatter(oldText);
  const newPart = splitFrontMatter(newText);
  const fmChanges = [];
  const keys = new Set([
    ...Object.keys(oldPart.data || {}),
    ...Object.keys(newPart.data || {}),
  ]);
  for (const key of [...keys].sort()) {
    const before = oldPart.data ? oldPart.data[key] : undefined;
    const after = newPart.data ? newPart.data[key] : undefined;
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      fmChanges.push({ key, from: summarize(before), to: summarize(after) });
    }
  }
  const body = diffBody(oldPart.body || '', newPart.body || '');
  return { frontMatter: fmChanges, body };
}

function summarize(value) {
  if (value === undefined) return '(absent)';
  const s = JSON.stringify(value) ?? String(value);
  return s.length > 80 ? `${s.slice(0, 77)}...` : s;
}

function diffBody(oldBody, newBody) {
  const oldLines = oldBody.split(/\r?\n/);
  const newLines = newBody.split(/\r?\n/);
  const oldSet = new Map();
  for (const line of oldLines) oldSet.set(line, (oldSet.get(line) || 0) + 1);
  let added = 0;
  let removed = 0;
  for (const line of newLines) {
    const have = oldSet.get(line) || 0;
    if (have > 0) oldSet.set(line, have - 1);
    else added += 1;
  }
  for (const count of oldSet.values()) removed += count;
  return {
    linesAdded: added,
    linesRemoved: removed,
    tableRowsBefore: countRows(oldBody),
    tableRowsAfter: countRows(newBody),
  };
}

function countRows(body) {
  let n = 0;
  for (const line of body.split(/\r?\n/)) {
    if (/^\|\s*\d+/.test(line)) n += 1;
  }
  return n;
}

export function gitHead(root) {
  try {
    return execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

export function gitStatusData(root) {
  try {
    const out = execSync('git status --porcelain -- data', { cwd: root, encoding: 'utf8' });
    return out.trim() === '' ? [] : out.trim().split(/\r?\n/);
  } catch {
    return [];
  }
}

export default { snapshot, diffSnapshots, diffFileContent, gitHead, gitStatusData };

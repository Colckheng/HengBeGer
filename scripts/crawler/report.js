import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { diffFileContent, gitHead } from './diff.js';

export const REPORTS_DIR = 'reports';

export function createReportId(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
}

export function treeHash(snapshotMap) {
  const lines = [...snapshotMap.entries()]
    .map(([rel, entry]) => `${rel}:${entry.hash}`)
    .sort();
  return crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
}

function ensureDir(root) {
  const dir = path.join(root, REPORTS_DIR);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function buildReport(root, { diff, snapshotBefore, snapshotAfter, anomalies = [], now = new Date() }) {
  const id = createReportId(now);
  const dir = ensureDir(root);
  const details = {};
  for (const rel of diff.modified) {
    const before = snapshotBefore.get(rel);
    const after = snapshotAfter.get(rel);
    if (before && after) details[rel] = diffFileContent(before.content, after.content);
  }
  const meta = {
    id,
    createdAt: now.toISOString(),
    gitCommit: gitHead(root),
    treeHash: treeHash(snapshotAfter),
    files: diff,
    details,
    anomalies,
    confirmed: false,
    syncCommand: `npm run sync -- --report ${id}`,
  };

  const md = renderMarkdown(meta);
  fs.writeFileSync(path.join(dir, `${id}.md`), md, 'utf8');
  fs.writeFileSync(path.join(dir, `${id}.json`), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  return meta;
}

function renderMarkdown(meta) {
  const { id, createdAt, gitCommit, files, details, anomalies, syncCommand } = meta;
  const out = [];
  out.push(`# 数据变更报告 ${id}`);
  out.push('');
  out.push(`- 生成时间：${createdAt}`);
  out.push(`- 基准 commit：${gitCommit || '(非 git 仓库)'}`);
  out.push(`- 新增 ${files.added.length} / 修改 ${files.modified.length} / 删除 ${files.deleted.length}`);
  out.push('');
  out.push('## 结论');
  out.push('');
  out.push(files.added.length + files.modified.length + files.deleted.length === 0 ? '无变更。' : '**存在变更，未确认前禁止同步入库。**');
  out.push('');
  out.push('## 新增');
  out.push('');
  out.push(files.added.length ? files.added.map((f) => `- ${f}`).join('\n') : '- （无）');
  out.push('');
  out.push('## 修改（字段级）');
  out.push('');
  const modified = files.modified;
  if (!modified.length) {
    out.push('- （无）');
  } else {
    for (const rel of modified) {
      const d = details[rel];
      out.push(`### ${rel}`);
      if (!d) {
        out.push('- (无法解析字段差异)');
        continue;
      }
      const fm = d.frontMatter;
      if (fm.length) {
        for (const c of fm) out.push(`- front-matter \`${c.key}\`: ${c.from} → ${c.to}`);
      }
      const b = d.body;
      if (b.linesAdded || b.linesRemoved) {
        out.push(`- 正文 +${b.linesAdded}/-${b.linesRemoved} 行，数据行 ${b.tableRowsBefore} → ${b.tableRowsAfter}`);
      }
      if (!fm.length && !b.linesAdded && !b.linesRemoved) out.push('- （仅空白/格式差异）');
    }
  }
  out.push('');
  out.push('## 删除');
  out.push('');
  out.push(files.deleted.length ? files.deleted.map((f) => `- ${f}`).join('\n') : '- （无）');
  out.push('');
  out.push('## 抽查异常');
  out.push('');
  out.push(anomalies.length ? anomalies.map((a) => `- ${a}`).join('\n') : '- （无）');
  out.push('');
  out.push('## 确认流程');
  out.push('');
  out.push('1. 核对以上变更；');
  out.push(`2. 确认无误后执行：\`${syncCommand}\`（未确认时该命令必须拒绝）；`);
  out.push('3. 同步后运行一致性校验，再提交 git。');
  out.push('');
  return out.join('\n');
}

export function reportPath(root, id) {
  return path.join(root, REPORTS_DIR, `${id}.json`);
}

export function loadReport(root, id) {
  const file = reportPath(root, id);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function listReports(root) {
  const dir = path.join(root, REPORTS_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}

export function markConfirmed(root, id) {
  const meta = loadReport(root, id);
  if (!meta) throw new Error(`report not found: ${id}`);
  meta.confirmed = true;
  meta.confirmedAt = new Date().toISOString();
  fs.writeFileSync(reportPath(root, id), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  return meta;
}

export function assertSyncAllowed(root, id, currentTreeHash) {
  const meta = loadReport(root, id);
  if (!meta) throw new Error(`report not found: ${id}`);
  if (!meta.confirmed) throw new Error(`report ${id} is not confirmed; sync refused`);
  if (currentTreeHash && meta.treeHash !== currentTreeHash) {
    throw new Error(`report ${id} does not match current data/ state; data changed after review, regenerate report`);
  }
  return meta;
}

export default {
  createReportId,
  treeHash,
  buildReport,
  reportPath,
  loadReport,
  listReports,
  markConfirmed,
  assertSyncAllowed,
  REPORTS_DIR,
};

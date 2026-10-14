// 上云数据包的公共读写与校验工具。
// 导出端（本机 scripts/cloud/export-data.mjs）与导入端（云端 import）共用同一套校验逻辑，
// 保证「本机说导出了什么」和「云端看到的是什么」用同一把尺子量。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// 包格式版本：字段结构变了就加一，导入端遇到不认识的版本直接拒绝。
export const FORMAT_VERSION = 1;

export function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function sha256Text(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return String(bytes);
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

// 写 manifest 用「先写临时文件再改名」，中途断掉也不会留下半个 JSON。
export function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

// manifest 是跨机器（Windows 导出 / Linux 导入）的交换格式，相对路径统一按正斜杠解释。
// 早期版本在 Windows 上用 path.join 写出过 `tables\\xxx.jsonl` 这种反斜杠路径，这里一并兼容。
export function toPosixPath(rel) {
  return String(rel).split('\\').join('/');
}

export function resolveInPackage(dir, rel) {
  return path.join(dir, ...toPosixPath(rel).split('/'));
}

export function readManifest(dir) {
  const file = path.join(dir, 'manifest.json');
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return { __parseError: error.message };
  }
}

export function countLines(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (text.length === 0) return 0;
  const trimmed = text.endsWith('\n') ? text.slice(0, -1) : text;
  return trimmed.length === 0 ? 0 : trimmed.split('\n').length;
}

// 校验包里的「一个文件条目」：存在、字节数、sha256、行数都要与 manifest 一致。
function checkFileEntry(dir, info, problems) {
  if (!info || !info.file) {
    problems.push('manifest 里缺少文件条目');
    return;
  }
  const label = toPosixPath(info.file);
  const file = resolveInPackage(dir, info.file);
  if (!fs.existsSync(file)) {
    problems.push('缺少文件 ' + label);
    return;
  }
  const stat = fs.statSync(file);
  if (Number.isFinite(info.bytes) && stat.size !== info.bytes) {
    problems.push(label + ' 字节数不符：manifest ' + info.bytes + '，实际 ' + stat.size);
  }
  if (info.sha256 && sha256File(file) !== info.sha256) {
    problems.push(label + ' sha256 不符');
  }
  if (Number.isFinite(info.count) && countLines(file) !== info.count) {
    problems.push(label + ' 行数不符：manifest ' + info.count + '，实际 ' + countLines(file));
  }
}

// 校验数据包（entries.jsonl + tables/*.jsonl + manifest.json）。
// 返回 { ok, problems, manifest }。
export function verifyDataPackage(dir) {
  const problems = [];
  const manifest = readManifest(dir);
  if (!manifest) return { ok: false, problems: ['缺少 manifest.json'], manifest: null };
  if (manifest.__parseError) return { ok: false, problems: ['manifest.json 解析失败：' + manifest.__parseError], manifest: null };
  if (manifest.formatVersion !== FORMAT_VERSION) {
    problems.push('formatVersion 不匹配：manifest ' + manifest.formatVersion + '，本工具 ' + FORMAT_VERSION);
  }
  const data = manifest.data;
  if (!data) {
    problems.push('manifest 里没有 data 段');
    return { ok: false, problems, manifest };
  }
  checkFileEntry(dir, data.entries, problems);
  for (const [name, info] of Object.entries(data.tables || {})) {
    if (!info || !info.file) info.file = 'tables/' + name + '.jsonl';
    checkFileEntry(dir, info, problems);
  }
  return { ok: problems.length === 0, problems, manifest };
}

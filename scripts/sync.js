import path from 'path';
import { fileURLToPath } from 'url';
import { snapshot } from './crawler/diff.js';
import { treeHash, loadReport, listReports, assertSyncAllowed } from './crawler/report.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseArgs(argv) {
  const opts = { report: null, apply: false, list: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--report') {
      opts.report = argv[i + 1] || null;
      i += 1;
    } else if (a === '--apply') {
      opts.apply = true;
    } else if (a === '--list') {
      opts.list = true;
    } else if (a === '--help' || a === '-h') {
      opts.help = true;
    } else if (!a.startsWith('-') && !opts.report) {
      opts.report = a;
    } else {
      opts.unknown = a;
    }
  }
  return opts;
}

function renderFileList(files, log) {
  if (files.added.length) log(`  新增 ${files.added.length}：${files.added.slice(0, 5).join('、')}${files.added.length > 5 ? ' …' : ''}`);
  if (files.modified.length) log(`  修改 ${files.modified.length}：${files.modified.slice(0, 5).join('、')}${files.modified.length > 5 ? ' …' : ''}`);
  if (files.deleted.length) log(`  删除 ${files.deleted.length}：${files.deleted.slice(0, 5).join('、')}${files.deleted.length > 5 ? ' …' : ''}`);
}

export function runSync(root, opts, log = () => {}) {
  if (opts.help || opts.unknown) {
    log('用法: npm run sync -- --report <报告id> [--apply]   （PowerShell 下等价: npm run sync <报告id>）');
    log('列出报告: node scripts/sync.js --list');
    return 1;
  }
  const dataRoot = path.join(root, 'data');
  if (opts.list) {
    const reports = listReports(root);
    if (!reports.length) {
      log('（无报告）');
      return 0;
    }
    for (const id of reports) {
      const meta = loadReport(root, id);
      log(`${meta.id}  ${meta.confirmed ? '已确认' : '未确认'}  变更 ${meta.files.added.length + meta.files.modified.length + meta.files.deleted.length}  创建于 ${meta.createdAt}`);
    }
    return 0;
  }
  if (!opts.report) {
    log('错误：缺少报告 ID（npm run sync -- --report <报告id>，或 npm run sync <报告id>；node scripts/sync.js --list 查看）');
    return 1;
  }
  const meta = loadReport(root, opts.report);
  if (!meta) {
    log(`错误：报告不存在：${opts.report}`);
    return 1;
  }
  log(`报告 ${meta.id}（创建于 ${meta.createdAt}）`);
  log(`新增 ${meta.files.added.length} / 修改 ${meta.files.modified.length} / 删除 ${meta.files.deleted.length}`);
  renderFileList(meta.files, log);
  log(`确认状态：${meta.confirmed ? `已确认（${meta.confirmedAt || ''}）` : '未确认'}`);
  let current;
  try {
    current = treeHash(snapshot(dataRoot));
  } catch (err) {
    log(`错误：无法读取 data/ 状态：${err.message}`);
    return 1;
  }
  try {
    assertSyncAllowed(root, opts.report, current);
  } catch (err) {
    log(`同步被拒绝：${err.message}`);
    return 1;
  }
  log('门禁校验通过。');
  if (!opts.apply) {
    log('干跑模式：未指定 --apply，不写数据库。');
    log('下一步：npm run sync -- --report ' + meta.id + ' --apply');
    return 0;
  }
  log('错误：--apply 数据库同步尚未实现（T3.2）');
  return 1;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const code = runSync(ROOT, opts, console.log);
  process.exitCode = code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

export default { parseArgs, runSync };

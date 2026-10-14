#!/usr/bin/env node
// 阶段 1：把本地 MySQL 的「数据」导出成上云用的一次性数据包。
//
//   npm run cloud:export              # 全量导出到 deploy/import/
//   npm run cloud:export:count        # 只连库数一数，不写文件
//   npm run cloud:export:verify       # 不连库，只校验已导出的包
//   node scripts/cloud/export-data.mjs --out D:\\tmp\\pkg    # 换输出目录（要带参数就用这种直调）
//
// 两个坑都踩过，别再踩：
//   1. 本机 shell 是 Windows PowerShell 5.1，它会吞掉裸的 --：npm run cloud:export -- --verify
//      实际执行成 npm run cloud:export --verify，npm 把 --verify 当自己的配置收走，
//      脚本收到的 argv 是空的 → 照常全量导出（实测，不是猜的）。
//      可靠写法：直调 node scripts/cloud/export-data.mjs --verify；或用上面两个参数写死的 npm 脚本；
//      或把分隔符加引号：npm run cloud:export "--" "--verify"。
//   2. 别用 --dry-run：那是 npm 原生标志，同样到不了脚本。本脚本的对应参数叫 --count-only。
//
// 三条硬约束：
//   1. 只读。全程 SELECT，进库就开 REPEATABLE READ 一致性快照，本地库一个字节都不写。
//   2. 时间字段用 dateStrings 原样取回：MySQL 里存的是什么字符串，包里就是什么字符串，
//      导入端原样写回，不做时区推算（同时把源库会话/全局时区记进 manifest 备用）。
//   3. 图片不在这里。catalog_assets 那 1710 张（315 MB base64）由 export-images.mjs
//      在阶段 2 解成 t/d 两档 WebP，走文件通道。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import {
  FORMAT_VERSION,
  countLines,
  formatBytes,
  readManifest,
  sha256File,
  sha256Text,
  verifyDataPackage,
  writeJsonAtomic,
} from './lib/package-io.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// 旧后台 15 张小表：不到 1 MB，照搬上云（云端只读，见设计文档 §2.6）。
const SMALL_TABLES = [
  'agents', 'app_meta', 'bumbos', 'drive_disks', 'factions',
  'hsr_characters', 'hsr_cones', 'hsr_elements', 'hsr_paths', 'hsr_rarities',
  'hsr_relic_types', 'hsr_relics', 'rarities', 'roles', 'sound_engines',
];

const ENTRY_COLUMNS = 'entry_key, category, name, payload, content_hash, updated_at';

function printHelp() {
  console.log(`用法：node scripts/cloud/export-data.mjs [选项]

  --out <目录>     输出目录，默认 deploy/import
  --count-only     只连库统计行数，不写任何文件（不要用 --dry-run，npm 会截胡）
  --verify         不连库，只校验已导出的包（文件/字节数/sha256/行数）
  -h, --help       显示这段说明`);
}

function parseArgs(argv) {
  const opts = { out: path.join(repoRoot, 'deploy', 'import'), dryRun: false, verify: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') {
      const value = argv[i + 1];
      if (!value) throw new Error('--out 后面要跟一个目录');
      opts.out = path.resolve(value);
      i += 1;
    } else if (arg === '--count-only') {
      opts.dryRun = true;
    } else if (arg === '--verify') {
      opts.verify = true;
    } else if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error('未知参数：' + arg);
    }
  }
  return opts;
}

function loadDbConfig() {
  const envFile = path.join(repoRoot, '.env');
  dotenv.config({ path: envFile });
  const password = process.env.DB_PASSWORD;
  if (!password) {
    throw new Error('缺少 DB_PASSWORD：先确认 ' + envFile + ' 里有数据库配置（密钥不回显）');
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password,
    database: process.env.DB_NAME || 'hengbeger',
  };
}

function jsonlLines(rows, normalize) {
  return rows.map((row) => JSON.stringify(normalize ? normalize(row) : row));
}

// payload 是 JSON 列。mysql2 正常会直接给对象；万一给的是字符串，这里补一次解析，
// 免得写进包里变成「字符串里再套一层 JSON」。
function normalizeEntry(row) {
  let payload = row.payload;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      throw new Error('entry ' + row.entry_key + ' 的 payload 不是合法 JSON');
    }
  }
  return { ...row, payload };
}

function writeJsonl(dir, relFile, lines) {
  const file = path.join(dir, relFile);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.length ? lines.join('\n') + '\n' : '', 'utf8');
  return file;
}

function describeFile(dir, relFile, lines) {
  const file = path.join(dir, relFile);
  const stat = fs.statSync(file);
  return { file: relFile, count: countLines(file), bytes: stat.size, sha256: sha256File(file) };
}

async function exportData(opts) {
  const config = loadDbConfig();
  const conn = await mysql.createConnection({
    ...config,
    // 时间原样取回字符串，导出端不做任何时区换算。
    dateStrings: true,
    charset: 'utf8mb4_unicode_ci',
    supportBigNumbers: true,
  });

  try {
    // 一致性快照：两张表之间不会看到别人的写入，导出的是同一个瞬间。
    await conn.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');

    const [[versionRow]] = await conn.query('SELECT VERSION() AS v, DATABASE() AS d');
    const [[tzRow]] = await conn.query('SELECT @@session.time_zone AS s, @@global.time_zone AS g');
    console.log('[export] 源：' + config.user + '@' + config.host + ':' + config.port + '/' + versionRow.d
      + '（MySQL ' + versionRow.v + '，时区 session=' + tzRow.s + ' global=' + tzRow.g + '）');
    console.log('[export] 只读快照已开启（REPEATABLE READ + CONSISTENT SNAPSHOT），本地库不做任何写入。');

    const [entryRows] = await conn.query('SELECT ' + ENTRY_COLUMNS + ' FROM catalog_entries ORDER BY entry_key');

    const tableRows = {};
    for (const table of SMALL_TABLES) {
      // ORDER BY 1：这 15 张表的第一列都是主键，排序后导出结果可复现。
      const [rows] = await conn.query('SELECT * FROM `' + table + '` ORDER BY 1');
      tableRows[table] = rows;
    }

    await conn.query('COMMIT');

    if (opts.dryRun) {
      const tableCount = Object.values(tableRows).reduce((sum, rows) => sum + rows.length, 0);
      console.log('[export] --count-only：条目 ' + entryRows.length + ' 行，小表 ' + SMALL_TABLES.length
        + ' 张共 ' + tableCount + ' 行。未写任何文件。');
      for (const table of SMALL_TABLES) {
        console.log('           ' + table.padEnd(18) + tableRows[table].length + ' 行');
      }
      return;
    }

    // 条目内容哈希聚合：云端靠它一眼看出「两个包是不是同一批数据」。
    const entryHashLines = entryRows.map((row) => row.entry_key + '\t' + (row.content_hash || '')).join('\n');
    const contentHashAggregate = sha256Text(entryHashLines);

    const entryLines = jsonlLines(entryRows, normalizeEntry);
    writeJsonl(opts.out, 'entries.jsonl', entryLines);
    const entriesInfo = describeFile(opts.out, 'entries.jsonl', entryLines);
    entriesInfo.contentHashAggregate = contentHashAggregate;

    const tablesInfo = {};
    let tablesBytes = 0;
    let tablesCount = 0;
    for (const table of SMALL_TABLES) {
      const relFile = path.join('tables', table + '.jsonl');
      const lines = jsonlLines(tableRows[table]);
      writeJsonl(opts.out, relFile, lines);
      const info = describeFile(opts.out, relFile, lines);
      tablesInfo[table] = info;
      tablesBytes += info.bytes;
      tablesCount += info.count;
    }

    const previous = readManifest(opts.out);
    const manifest = previous && !previous.__parseError && previous.formatVersion === FORMAT_VERSION ? previous : {};
    manifest.formatVersion = FORMAT_VERSION;
    manifest.exportedAt = new Date().toISOString();
    manifest.source = {
      host: config.host,
      port: config.port,
      user: config.user,
      database: versionRow.d,
      serverVersion: versionRow.v,
      sessionTimeZone: tzRow.s,
      globalTimeZone: tzRow.g,
    };
    manifest.data = { entries: entriesInfo, tables: tablesInfo, totalBytes: entriesInfo.bytes + tablesBytes };
    if (manifest.images === undefined) manifest.images = null;
    writeJsonAtomic(path.join(opts.out, 'manifest.json'), manifest);

    console.log('[export] 条目 catalog_entries：' + entriesInfo.count + ' 行 -> entries.jsonl（'
      + formatBytes(entriesInfo.bytes) + '，sha256 ' + entriesInfo.sha256.slice(0, 16) + '…）');
    console.log('[export] 小表 ' + SMALL_TABLES.length + ' 张：' + tablesCount + ' 行 -> tables/*.jsonl（'
      + formatBytes(tablesBytes) + '）');
    console.log('[export] 内容哈希聚合：' + contentHashAggregate.slice(0, 32) + '…');
    console.log('[export] manifest：manifest.json（其余 ' + formatBytes(entriesInfo.bytes + tablesBytes) + '）');

    const check = verifyDataPackage(opts.out);
    if (!check.ok) {
      console.error('[export] 自检失败：');
      for (const problem of check.problems) console.error('         - ' + problem);
      process.exitCode = 1;
      return;
    }
    console.log('[export] 自检通过：文件、字节数、sha256、行数都与 manifest 一致。');
    console.log('[export] 提醒：图片不在这里（catalog_assets 1710 行 / 315 MB base64），'
      + '阶段 2 由 export-images.mjs 导出成 t/d 两档 WebP。');
  } finally {
    await conn.end();
  }
}

function verifyOnly(opts) {
  const check = verifyDataPackage(opts.out);
  if (!check.manifest) {
    console.error('[export] ' + opts.out + ' 里没有可用的 manifest.json：先跑一次 npm run cloud:export');
    process.exitCode = 1;
    return;
  }
  const data = check.manifest.data || {};
  const entries = data.entries || {};
  console.log('[export] 校验 ' + opts.out);
  console.log('[export] 导出时间 ' + check.manifest.exportedAt + '，条目 ' + entries.count
    + ' 行（' + formatBytes(entries.bytes || 0) + '），小表 ' + Object.keys(data.tables || {}).length + ' 张');
  if (check.ok) {
    console.log('[export] 通过：包完整，可以直接上云。');
    return;
  }
  console.error('[export] 失败 ' + check.problems.length + ' 项：');
  for (const problem of check.problems) console.error('         - ' + problem);
  process.exitCode = 1;
}

try {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.verify) {
    verifyOnly(opts);
  } else {
    await exportData(opts);
  }
} catch (error) {
  console.error('[export] ' + error.message);
  process.exitCode = 1;
}

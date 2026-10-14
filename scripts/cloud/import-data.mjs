// 阶段 3：把本机导出的数据包导入云端（或本机预演栈）。
//
// 运行位置：**app 容器内**（`node scripts/cloud/import-data.mjs --dir /import`），
// 也可以在任何有 node_modules、能连到目标库、且能看到数据包的机器上跑。
// 容器里 `/import` 是 compose 只读挂载进来的宿主 deploy/import 目录；
// `/srv/images` 是图片具名卷；DB_HOST/DB_USER/DB_PASSWORD/DB_NAME/IMAGES_ROOT 由 compose 注入。
//
// 语义（设计文档 §2.3）：
//   * 条目与小表都是 upsert（INSERT … ON DUPLICATE KEY UPDATE），**默认不删任何东西**；
//     要删必须显式 --prune，而且只有再带上 --yes 才真的动手（只给 --prune 时只打印待删清单）。
//   * 导入后做**逐键回查**强校验：包内每个 entry_key 必须存在且 content_hash 一致，
//     任何一条不一致就 exit 1 —— 宁可不报成功，也不让云端带着半套数据对外服务。
//   * 图片按内容寻址（文件名 = 图片字节的 sha256），目标已存在且大小相同就跳过，天然幂等。
//
// 参数名有两个坑：
//   1. Windows PowerShell 5.1 会把 `npm run x -- --flag` 里的裸 `--` 吞掉（脚本收到空 argv），
//      要传自定义标志就写 `npm run x "--" "--flag"` 或直接 node。
//   2. `--dry-run` 是 npm 自己的原生标志，会被 npm 截走，所以这里刻意叫 `--check`。
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { connectCatalog, ensureCatalog, targetIdentity } from '../catalog/database.js';
import { readManifest, verifyDataPackage, formatBytes, resolveInPackage } from './lib/package-io.mjs';

const ENTRY_COLUMNS = ['entry_key', 'category', 'name', 'payload', 'content_hash', 'updated_at'];
const VERIFY_CHUNK = 500;

function printHelp() {
  console.log(`用法：node scripts/cloud/import-data.mjs [选项]

  --dir <目录>        数据包目录（默认容器内 /import，否则仓库下的 deploy/import）
  --check             只体检不改动：核对包完整性 + 逐键比对云端现状，打印将要新增/更新多少
  --data-only         只导条目与小表，不碰图片
  --images-only       只导图片，不碰数据库
  --images-root <目录>  图片落盘根目录（默认环境变量 IMAGES_ROOT，再默认 /srv/images）
  --batch <N>         每批插入行数（默认 200）
  --prune             打印包外待删的条目与图片（不动手）
  --yes               与 --prune 连用才真的删除
  -h, --help          显示本帮助

退出码：0 全部成功；1 校验失败或写入失败。`);
}

function parseArgs(argv) {
  const opts = {
    dir: null, check: false, dataOnly: false, imagesOnly: false,
    prune: false, yes: false, batch: 200,
    imagesRoot: process.env.IMAGES_ROOT || '/srv/images',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dir') opts.dir = argv[++i];
    else if (arg === '--check') opts.check = true;
    else if (arg === '--data-only') opts.dataOnly = true;
    else if (arg === '--images-only') opts.imagesOnly = true;
    else if (arg === '--images-root') opts.imagesRoot = argv[++i];
    else if (arg === '--batch') opts.batch = Math.max(1, Number(argv[++i]) || 200);
    else if (arg === '--prune') opts.prune = true;
    else if (arg === '--yes') opts.yes = true;
    else if (arg === '-h' || arg === '--help') { printHelp(); process.exit(0); }
    else throw new Error('未知参数：' + arg);
  }
  if (!opts.dir) opts.dir = fs.existsSync('/import') ? '/import' : path.resolve('deploy/import');
  if (opts.dataOnly && opts.imagesOnly) throw new Error('--data-only 与 --images-only 不能同时用');
  return opts;
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// 逐行读 JSONL。回调里可以 await（readline 会背压），行号从 1 开始用于报错定位。
async function readJsonl(file, onRow) {
  const stream = fs.createReadStream(file, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let lineNo = 0;
  try {
    for await (const line of rl) {
      lineNo += 1;
      if (!line.trim()) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch (error) {
        throw new Error(file + ':' + lineNo + ' 不是合法 JSON：' + error.message);
      }
      await onRow(row, lineNo);
    }
  } finally {
    rl.close();
    stream.destroy();
  }
  return lineNo;
}

function normalizePayload(payload, where) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    if (typeof payload === 'string') {
      try { return JSON.parse(payload); } catch { /* 落到下面报错 */ }
    }
    throw new Error(where + ' 的 payload 不是 JSON 对象');
  }
  return payload;
}

// ---------- 条目 ----------

async function readEntryRecords(dir) {
  const file = resolveInPackage(dir, 'entries.jsonl');
  const records = [];
  let filledUpdatedAt = 0;
  await readJsonl(file, (row, lineNo) => {
    const where = 'entries.jsonl:' + lineNo;
    if (!row.entry_key) throw new Error(where + ' 缺少 entry_key');
    if (!row.content_hash) throw new Error(where + ' 缺少 content_hash');
    if (row.updated_at === null || row.updated_at === undefined) filledUpdatedAt += 1;
    normalizePayload(row.payload, where);
    records.push({ key: row.entry_key, hash: row.content_hash });
  });
  return { file, records, filledUpdatedAt };
}

// 只读体检：逐键比对云端现状，分类为「已一致 / 会更新 / 将新增」。
async function checkEntries(connection, records) {
  const stats = { same: 0, update: 0, insert: 0, cloudRows: 0, tableMissing: false };
  try {
    for (const part of chunk(records, VERIFY_CHUNK)) {
      const [rows] = await connection.query('SELECT entry_key, content_hash FROM catalog_entries WHERE entry_key IN (?)', [part.map((r) => r.key)]);
      const got = new Map(rows.map((r) => [r.entry_key, r.content_hash]));
      for (const record of part) {
        const hash = got.get(record.key);
        if (hash === undefined) stats.insert += 1;
        else if (hash === record.hash) stats.same += 1;
        else stats.update += 1;
      }
    }
    const [[{ total }]] = await connection.query('SELECT COUNT(*) AS total FROM catalog_entries');
    stats.cloudRows = Number(total);
  } catch (error) {
    // 首次上云时表还不存在，不是错误：真导入时 ensureCatalog 会建。
    if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
    stats.tableMissing = true;
    stats.insert = records.length;
  }
  return stats;
}

async function importEntries(connection, dir, batchSize) {
  const { file, records } = await readEntryRecords(dir);
  let written = 0;
  let filledUpdatedAt = 0;
  await connection.beginTransaction();
  try {
    let buf = [];
    const flush = async () => {
      if (!buf.length) return;
      await connection.query(
        `INSERT INTO catalog_entries (${ENTRY_COLUMNS.join(',')}) VALUES ? ON DUPLICATE KEY UPDATE category=VALUES(category), name=VALUES(name), payload=VALUES(payload), content_hash=VALUES(content_hash), updated_at=VALUES(updated_at)`,
        [buf],
      );
      buf = [];
    };
    await readJsonl(file, async (row, lineNo) => {
      const where = 'entries.jsonl:' + lineNo;
      if (!row.entry_key) throw new Error(where + ' 缺少 entry_key');
      if (!row.content_hash) throw new Error(where + ' 缺少 content_hash');
      const payload = normalizePayload(row.payload, where);
      const updatedAt = row.updated_at === null || row.updated_at === undefined ? new Date() : row.updated_at;
      if (row.updated_at === null || row.updated_at === undefined) filledUpdatedAt += 1;
      buf.push([row.entry_key, row.category ?? '', row.name ?? row.entry_key, JSON.stringify(payload), row.content_hash, updatedAt]);
      written += 1;
      if (buf.length >= batchSize) await flush();
    });
    await flush();
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
  return { written, filledUpdatedAt, records };
}

async function verifyEntries(connection, records) {
  const problems = [];
  for (const part of chunk(records, VERIFY_CHUNK)) {
    const [rows] = await connection.query('SELECT entry_key, content_hash FROM catalog_entries WHERE entry_key IN (?)', [part.map((r) => r.key)]);
    const got = new Map(rows.map((r) => [r.entry_key, r.content_hash]));
    for (const record of part) {
      const hash = got.get(record.key);
      if (hash === undefined) problems.push('云端缺少条目 ' + record.key);
      else if (hash !== record.hash) problems.push('条目 content_hash 不一致：' + record.key);
    }
  }
  return problems;
}

// ---------- 旧后台小表 ----------

// 这 15 张表之间有外键（agents.factionId -> factions.id 等），插入顺序必须先父后子。
// 顺序从云端自己的 information_schema 读出来，不写死在脚本里——将来加了表也不用改。
async function dependencyOrder(connection, tables) {
  const wanted = new Set(tables);
  const deps = new Map(tables.map((t) => [t, new Set()]));
  const [rows] = await connection.query(
    `SELECT TABLE_NAME AS child, REFERENCED_TABLE_NAME AS parent FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL AND TABLE_NAME <> REFERENCED_TABLE_NAME`,
  );
  for (const row of rows) {
    if (wanted.has(row.child) && wanted.has(row.parent)) deps.get(row.child).add(row.parent);
  }
  const ordered = [];
  const done = new Set();
  let progress = true;
  while (progress) {
    progress = false;
    for (const table of tables) {
      if (done.has(table)) continue;
      if ([...deps.get(table)].every((parent) => done.has(parent))) {
        ordered.push(table);
        done.add(table);
        progress = true;
      }
    }
  }
  const cycles = tables.filter((t) => !done.has(t));
  return { ordered: ordered.concat(cycles), cycles };
}

// 逐表把包内容写回云端。调用方保证表已清空、外键检查已关，这里只管原样插入（含 id）。
async function replaceTables(connection, dir, manifest, ordered, batchSize, notes, summary) {
  for (const name of ordered) {
    const info = manifest.data.tables[name];
    const file = resolveInPackage(dir, info.file || 'tables/' + name + '.jsonl');
    const [exists] = await connection.query('SHOW TABLES LIKE ?', [name]);
    if (!exists.length) {
      summary.push({ table: name, rows: 0, skipped: '云端还没有这张表' });
      notes.push('表 ' + name + ' 在云端还不存在，已跳过（app 启动时 sequelize sync 会自动建；建好后再导一次即可）');
      continue;
    }
    const [columns] = await connection.query(`SHOW COLUMNS FROM \`${name}\``);
    const allowed = columns.map((c) => c.Field);
    const pk = columns.find((c) => c.Key === 'PRI')?.Field || null;
    const rows = [];
    await readJsonl(file, (row) => { rows.push(row); });
    const useCols = allowed.filter((col) => rows.some((row) => row[col] !== undefined));
    if (!useCols.length || !rows.length) {
      summary.push({ table: name, rows: 0, skipped: '包内没有可写入的列' });
      continue;
    }
    const sql = `INSERT INTO \`${name}\` (${useCols.map((c) => '\`' + c + '\`').join(',')}) VALUES ?`;
    const values = rows.map((row) => useCols.map((col) => (row[col] === undefined ? null : row[col])));
    await connection.query(`DELETE FROM \`${name}\``);
    for (const part of chunk(values, batchSize)) {
      await connection.query(sql, [part]);
    }
    // 逐主键回查（这些小表最多几十行，代价可忽略）
    let missing = 0;
    if (pk) {
      for (const part of chunk(rows.map((row) => row[pk]), VERIFY_CHUNK)) {
        const [found] = await connection.query(`SELECT \`${pk}\` AS id FROM \`${name}\` WHERE \`${pk}\` IN (?)`, [part]);
        missing += part.length - found.length;
      }
    }
    summary.push({ table: name, rows: rows.length, pk, missing });
    if (missing) notes.push('表 ' + name + ' 有 ' + missing + ' 行写入后没查到，请检查主键定义');
  }
}

async function importTables(connection, dir, manifest, batchSize, notes, failures) {
  const summary = [];
  const wanted = Object.keys(manifest.data.tables || {});
  const { ordered, cycles } = await dependencyOrder(connection, wanted);
  if (cycles.length) notes.push('这几张表的外键互相成环，按包内顺序插入：' + cycles.join(', '));

  // 云端这 15 张旧后台表是只读参考数据（nginx 把它们背后的 /api/ 全 403 了），但 app 首次启动会
  // 用种子数据灌一遍：种子行的 id 是自增出来的，和本地库不一致，而 name 上有唯一索引，于是「按主键
  // upsert」会在 id 和 name 之间互相顶掉（Duplicate entry '天琴座' for key 'factions.name'）。
  // 语义因此定为：数据包是唯一真相，整表替换 —— 关外键检查、DELETE、按包原样写回（id 也照抄），
  // 全部放在一个事务里，任何一步失败就整体回滚，云端保持导入前的样子。
  notes.push('15 张小表按包内内容整体替换（先 DELETE 再原样写回，保留本地 id）。');
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  await connection.query('START TRANSACTION');
  try {
    await replaceTables(connection, dir, manifest, ordered, batchSize, notes, summary);
    await connection.query('COMMIT');
  } catch (error) {
    await connection.query('ROLLBACK');
    failures.push({ table: '小表整体替换', message: error.message });
    notes.push('小表这一步整体回滚了，云端这些表还是导入前的样子。');
  } finally {
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  }

  const orphans = await orphanReport(connection, wanted);
  for (const orphan of orphans) failures.push({ table: '外键完整性', message: orphan });
  if (!orphans.length) notes.push('外键完整性检查通过：这些小表之间没有悬空引用。');
  return summary;
}

// 关掉外键检查期间写进去的行，提交后自己验一遍引用是否都落地（悬空引用说明包本身有问题）。
async function orphanReport(connection, tables) {
  const wanted = new Set(tables);
  const [fks] = await connection.query(
    `SELECT TABLE_NAME AS child, COLUMN_NAME AS childCol, REFERENCED_TABLE_NAME AS parent, REFERENCED_COLUMN_NAME AS parentCol
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL AND TABLE_NAME <> REFERENCED_TABLE_NAME`,
  );
  const orphans = [];
  for (const fk of fks) {
    if (!wanted.has(fk.child) || !wanted.has(fk.parent)) continue;
    const [[row]] = await connection.query(
      `SELECT COUNT(*) AS n FROM \`${fk.child}\` c LEFT JOIN \`${fk.parent}\` p
         ON c.\`${fk.childCol}\` = p.\`${fk.parentCol}\`
        WHERE c.\`${fk.childCol}\` IS NOT NULL AND p.\`${fk.parentCol}\` IS NULL`,
    );
    if (row.n > 0) {
      orphans.push(fk.child + '.' + fk.childCol + ' -> ' + fk.parent + '.' + fk.parentCol + ' 有 ' + row.n + ' 行悬空');
    }
  }
  return orphans;
}

// ---------- 图片 ----------

const TIERS = [['thumbs', 't'], ['displays', 'd']];

function tierSource(dir, manifest, key) {
  const info = manifest.images?.[key];
  if (!info?.dir) return null;
  return { info, dir: resolveInPackage(dir, info.dir), suffix: info.suffix || '.webp' };
}

function listTierFiles(destDir, suffix) {
  if (!fs.existsSync(destDir)) return [];
  return fs.readdirSync(destDir).filter((n) => n.endsWith(suffix));
}

async function importImages(dir, manifest, root, notes) {
  const summary = [];
  for (const [key, sub] of TIERS) {
    const source = tierSource(dir, manifest, key);
    if (!source) { summary.push({ tier: sub, skipped: 'manifest 里没有这一段' }); continue; }
    if (!fs.existsSync(source.dir)) { summary.push({ tier: sub, skipped: '包内没有目录 ' + source.info.dir }); continue; }
    const names = (await fsp.readdir(source.dir)).filter((n) => n.endsWith(source.suffix));
    const destDir = path.join(root, sub);
    await fsp.mkdir(destDir, { recursive: true });
    let copied = 0;
    let skipped = 0;
    let bytes = 0;
    for (const name of names) {
      const from = path.join(source.dir, name);
      const to = path.join(destDir, name);
      const sourceStat = await fsp.stat(from);
      let destStat = null;
      try { destStat = await fsp.stat(to); } catch { /* 目标不存在，正常 */ }
      if (destStat && destStat.size === sourceStat.size) { skipped += 1; continue; }
      const tmp = to + '.part';
      await fsp.copyFile(from, tmp);
      await fsp.rename(tmp, to);
      copied += 1;
      bytes += sourceStat.size;
    }
    const have = listTierFiles(destDir, source.suffix).length;
    if (Number.isFinite(source.info.count) && names.length < source.info.count) {
      notes.push('图片 ' + source.info.dir + ' 实际只有 ' + names.length + ' 张，manifest 说有 ' + source.info.count + ' 张');
    }
    if (Number.isFinite(source.info.count) && have < source.info.count) {
      notes.push('落盘后 ' + sub + ' 档只有 ' + have + ' 张，manifest 说有 ' + source.info.count + ' 张');
    }
    summary.push({ tier: sub, names: names.length, copied, skipped, bytes, have });
  }
  return summary;
}

// ---------- 包外数据（--prune） ----------

async function reportAndPrune(connection, opts, imagesInfo, dir, manifest, root) {
  const packageKeys = new Set(imagesInfo.packageKeys);
  const [rows] = await connection.query('SELECT entry_key FROM catalog_entries');
  const doomedRows = rows.map((r) => r.entry_key).filter((k) => !packageKeys.has(k));
  console.log('\n[prune] 云端条目 ' + rows.length + " 条，其中不在包内的 " + doomedRows.length + ' 条');
  if (doomedRows.length) console.log('[prune] 前 20 个：' + doomedRows.slice(0, 20).join(', '));
  let doomedFiles = 0;
  for (const [key, sub] of TIERS) {
    const source = tierSource(dir, manifest, key);
    const suffix = source?.suffix || '.webp';
    const destDir = path.join(root, sub);
    const files = listTierFiles(destDir, suffix).filter((n) => !packageKeys.has(n.slice(0, -suffix.length)));
    doomedFiles += files.length;
    console.log('[prune] ' + sub + ' 档不在包内的图片 ' + files.length + ' 张');
    if (files.length && opts.yes) {
      for (const name of files) await fsp.rm(path.join(destDir, name), { force: true });
      console.log('[prune] 已删除 ' + files.length + ' 个文件');
    }
  }
  if (!opts.prune || !opts.yes) {
    console.log('[prune] 只给 --prune 不会动任何数据；确认清单无误后加 --yes 才真的删除。');
    return;
  }
  for (const part of chunk(doomedRows, VERIFY_CHUNK)) {
    await connection.query('DELETE FROM catalog_entries WHERE entry_key IN (?)', [part]);
  }
  console.log('[prune] 已删除条目 ' + doomedRows.length + ' 条，图片 ' + doomedFiles + ' 张');
}

// ---------- 主流程 ----------

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log('数据包目录：' + opts.dir);
  const manifest = readManifest(opts.dir);
  if (!manifest) throw new Error('没有找到 manifest.json：先在导出端跑 npm run cloud:export');
  if (manifest.__parseError) throw new Error('manifest.json 解析失败：' + manifest.__parseError);
  const verdict = verifyDataPackage(opts.dir);
  if (!verdict.ok) {
    console.error('[失败] 数据包自身校验不通过，拒绝导入：');
    for (const problem of verdict.problems) console.error('  - ' + problem);
    process.exit(1);
  }
  const entryInfo = manifest.data.entries || {};
  console.log('包内容：' + (entryInfo.count ?? '?') + ' 条条目（' + formatBytes(entryInfo.bytes || 0) + '），'
    + Object.keys(manifest.data.tables || {}).length + ' 张小表，导出时间 ' + manifest.exportedAt);

  const connection = await connectCatalog();
  try {
    const identity = await targetIdentity(connection);
    console.log('目标库：' + identity.db + ' @ ' + (process.env.DB_HOST || 'localhost') + ':' + (process.env.DB_PORT || 3306));

    if (opts.check) {
      const { records } = await readEntryRecords(opts.dir);
      const stats = await checkEntries(connection, records);
      console.log('\n[check] 条目：一致 ' + stats.same + '，会更新 ' + stats.update + '，将新增 ' + stats.insert
        + '；云端当前 ' + stats.cloudRows + ' 条' + (stats.tableMissing ? '（云端还没有 catalog_entries 表，首次导入会建）' : ''));
      const outside = stats.cloudRows - stats.same - stats.update;
      if (outside > 0) console.log('[check] 云端有 ' + outside + ' 条不在包里（默认不动；要清用 --prune）');
      console.log('[check] 图片不落盘，只核对包内张数：');
      for (const [key, sub] of TIERS) {
        const source = tierSource(opts.dir, manifest, key);
        const have = source && fs.existsSync(source.dir) ? (await fsp.readdir(source.dir)).filter((n) => n.endsWith(source.suffix)).length : 0;
        console.log('  ' + sub + ' 档：包内 ' + have + " 张，manifest " + (source?.info.count ?? '?') + ' 张');
      }
      console.log('\n[check] 未做任何改动。');
      return;
    }

    let packageKeys = [];
    if (!opts.imagesOnly) {
      await ensureCatalog(connection);
      const result = await importEntries(connection, opts.dir, opts.batch);
      packageKeys = result.records.map((r) => r.key);
      console.log('\n条目写入 ' + result.written + ' 行（事务已提交）'
        + (result.filledUpdatedAt ? '，其中 ' + result.filledUpdatedAt + ' 行的 updated_at 缺失已用当前时间兜底' : ''));
      const problems = await verifyEntries(connection, result.records);
      if (problems.length) {
        console.error('[失败] 逐键回查不通过（' + problems.length + ' 条）：');
        for (const problem of problems.slice(0, 20)) console.error('  - ' + problem);
        process.exit(1);
      }
      console.log('逐键回查通过：' + result.records.length + ' 个 entry_key 全部存在且 content_hash 一致');
    }

    const notes = [];
    const failures = [];
    if (!opts.imagesOnly) {
      const tables = await importTables(connection, opts.dir, manifest, opts.batch, notes, failures);
      console.log('\n旧后台小表：');
      for (const row of tables) {
        console.log('  ' + (row.table + '                    ').slice(0, 20) + (row.skipped ? '跳过（' + row.skipped + '）' : row.rows + ' 行'));
      }
    }

    if (!opts.dataOnly) {
      const images = await importImages(opts.dir, manifest, opts.imagesRoot, notes);
      console.log('\n图片（根目录 ' + opts.imagesRoot + '）：');
      for (const row of images) {
        console.log('  ' + row.tier + ' 档：' + (row.skipped ? '跳过（' + row.skipped + '）'
          : '包内 ' + row.names + ' 张，本次复制 ' + row.copied + '，已存在跳过 ' + row.skipped + '，写入 ' + formatBytes(row.bytes) + '，落盘后共 ' + row.have + ' 张'));
      }
    }

    if (opts.prune) {
      if (!packageKeys.length) {
        const { records } = await readEntryRecords(opts.dir);
        packageKeys = records.map((r) => r.key);
      }
      await reportAndPrune(connection, opts, { packageKeys }, opts.dir, manifest, opts.imagesRoot);
    }

    if (notes.length) {
      console.log('\n注意：');
      for (const note of notes) console.log('  - ' + note);
    }
    if (failures.length) {
      console.error('\n[失败] ' + failures.length + ' 张小表没有写进去：');
      for (const failure of failures) console.error('  - ' + failure.table + '：' + failure.message);
      console.error('条目与图片已经导入完成；这几张表请修好外键数据后重跑一次。');
      process.exit(1);
    }
    console.log('\n导入完成。file 模式下出图地址以磁盘 t 档为准，最多 60 秒后生效。');
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('[失败] ' + error.message);
  process.exit(1);
});

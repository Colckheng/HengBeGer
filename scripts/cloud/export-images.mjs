#!/usr/bin/env node
// 阶段 2：把 catalog_assets 里那 1710 张 base64 图，导出成上云用的两档 WebP 文件。
//
//   npm run cloud:images            # 全量导出到 deploy/import/images/
//   npm run cloud:images:verify     # 不连库，只校验产物与 manifest
//   node scripts/cloud/export-images.mjs --limit 5        # 冒烟：只处理 5 张（要带参数就直调 node）
//   node scripts/cloud/export-images.mjs --force          # 重做，覆盖已有文件
//
// 为什么不在云端转格式：图片反正要落盘，在本机解一次 base64 比「传 315 MB 上云再解再落盘」
// 省一半力气；云端也就不需要装任何图像处理库（设计文档 §3.2/§3.3）。
//
// 两档尺寸（设计文档 §3.2）：
//   images/t/<sha256>.webp   宽 320，列表/网格用，约 18 KB/张
//   images/d/<sha256>.webp   长边 1280 q85，详情页用，约 50 KB/张
// 文件名 = 图片内容的 sha256（内容寻址）→ 内容变了文件名就变，所以 immutable 名正言顺。
//
// 三条硬规矩：
//   1. 只读。全程 SELECT，本地库一个字节都不写。
//   2. 先校验再落盘：解码后的字节 sha256 必须等于库里那行的 hash，对不上就报错跳过，
//      绝不把可疑内容写进包（server/catalog.js 出图时也是这么校验的）。
//   3. 原子写：先写 .part 再 rename，中途断电不会留下半个文件被当成有效缓存。
//
// 传参提醒：本机 shell 是 Windows PowerShell 5.1，它会吞掉裸 --，
// 所以 npm run cloud:images -- --limit 5 的参数到不了脚本。要带参数请直调 node。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { FORMAT_VERSION, formatBytes, readManifest, writeJsonAtomic } from './lib/package-io.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// 与 server/catalog.js 解析 data URL 用的是同一个形状，别改松了。
const DATA_URL_RE = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/;

function printHelp() {
  console.log(`用法：node scripts/cloud/export-images.mjs [选项]

  --out <目录>        输出目录，默认 deploy/import/images
  --limit <N>         只处理前 N 张（冒烟用）
  --force             覆盖已存在的文件（默认跳过：内容寻址，文件名对就说明内容对）
  --verify            不连库，只校验产物与 manifest
  --concurrency <N>   并发转码数，默认 4
  --thumb-width <N>   缩略图宽，默认 320
  --display-size <N>  显示图长边，默认 1280
  --thumb-quality <N> 缩略图质量，默认 80
  --display-quality <N> 显示图质量，默认 85
  -h, --help          显示这段说明`);
}

function parseArgs(argv) {
  const opts = {
    out: path.join(repoRoot, 'deploy', 'import', 'images'),
    manifestDir: path.join(repoRoot, 'deploy', 'import'),
    limit: 0,
    force: false,
    verify: false,
    concurrency: 4,
    thumbWidth: 320,
    displaySize: 1280,
    thumbQuality: 80,
    displayQuality: 85,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(arg + ' 缺少取值');
      i += 1;
      return value;
    };
    if (arg === '--out') {
      opts.out = path.resolve(next());
      opts.manifestDir = path.dirname(opts.out);
    } else if (arg === '--limit') opts.limit = Number.parseInt(next(), 10);
    else if (arg === '--concurrency') opts.concurrency = Number.parseInt(next(), 10);
    else if (arg === '--thumb-width') opts.thumbWidth = Number.parseInt(next(), 10);
    else if (arg === '--display-size') opts.displaySize = Number.parseInt(next(), 10);
    else if (arg === '--thumb-quality') opts.thumbQuality = Number.parseInt(next(), 10);
    else if (arg === '--display-quality') opts.displayQuality = Number.parseInt(next(), 10);
    else if (arg === '--force') opts.force = true;
    else if (arg === '--verify') opts.verify = true;
    else if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    } else throw new Error('未知参数：' + arg);
  }
  if (!Number.isFinite(opts.concurrency) || opts.concurrency < 1) throw new Error('--concurrency 必须是正整数');
  return opts;
}

function loadDbConfig() {
  const envFile = path.join(repoRoot, '.env');
  dotenv.config({ path: envFile });
  if (!process.env.DB_PASSWORD) throw new Error('缺少 DB_PASSWORD：先确认 ' + envFile + ' 里有数据库配置（密钥不回显）');
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'hengbeger',
  };
}

async function loadSharp() {
  try {
    const module = await import('sharp');
    return module.default;
  } catch (error) {
    throw new Error('没装上 sharp（本机一次性转码用，属于 devDependency）：先跑 npm install，原始错误：' + error.message);
  }
}

function writeFileAtomic(file, buffer) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.part';
  fs.writeFileSync(tmp, buffer);
  fs.renameSync(tmp, file);
}

// 把一行 catalog_assets 变成两张 WebP。返回 { thumbBytes, displayBytes, skipped }。
async function convertRow(sharp, opts, row) {
  const match = DATA_URL_RE.exec(row.image || '');
  if (!match) throw new Error('image 列不是预期的 data URL（hash ' + row.hash + '）');
  const bytes = Buffer.from(match[2], 'base64');
  const actual = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actual !== row.hash) {
    throw new Error('内容校验失败：库里 hash=' + row.hash + '，解码后算出来=' + actual + '（不写盘）');
  }

  const thumbFile = path.join(opts.out, 't', row.hash + '.webp');
  const displayFile = path.join(opts.out, 'd', row.hash + '.webp');
  const thumbDone = !opts.force && fs.existsSync(thumbFile) && fs.statSync(thumbFile).size > 0;
  const displayDone = !opts.force && fs.existsSync(displayFile) && fs.statSync(displayFile).size > 0;
  if (thumbDone && displayDone) {
    return { thumbBytes: fs.statSync(thumbFile).size, displayBytes: fs.statSync(displayFile).size, skipped: true };
  }

  // rotate()：带上 EXIF 方向信息时自动摆正（这些图一般没有，加上无害）。
  const pipeline = sharp(bytes, { failOn: 'none' }).rotate();
  if (!thumbDone) {
    const thumb = await pipeline
      .clone()
      .resize({ width: opts.thumbWidth, withoutEnlargement: true })
      .webp({ quality: opts.thumbQuality })
      .toBuffer();
    writeFileAtomic(thumbFile, thumb);
  }
  if (!displayDone) {
    const display = await pipeline
      .clone()
      .resize({ width: opts.displaySize, height: opts.displaySize, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: opts.displayQuality })
      .toBuffer();
    writeFileAtomic(displayFile, display);
  }
  return {
    thumbBytes: fs.statSync(thumbFile).size,
    displayBytes: fs.statSync(displayFile).size,
    skipped: false,
  };
}

async function exportImages(opts) {
  const sharp = await loadSharp();
  const config = loadDbConfig();
  const conn = await mysql.createConnection({ ...config, charset: 'utf8mb4', supportBigNumbers: true });

  try {
    const [[meta]] = await conn.query('SELECT VERSION() AS v, COUNT(*) AS n, SUM(LENGTH(image)) AS bytes FROM catalog_assets');
    console.log('[images] 源：' + config.user + '@' + config.host + ':' + config.port + '/' + config.database
      + '（MySQL ' + meta.v + '）catalog_assets ' + meta.n + ' 行 / base64 共 ' + formatBytes(Number(meta.bytes)) + '，只读。');

    const total = opts.limit > 0 ? Math.min(opts.limit, Number(meta.n)) : Number(meta.n);
    let cursor = '';
    let processed = 0;
    let skipped = 0;
    let thumbBytes = 0;
    let displayBytes = 0;
    const problems = [];
    const startedAt = Date.now();
    const batchSize = Math.max(opts.concurrency * 4, 16);

    while (processed < total) {
      const remaining = total - processed;
      const [rows] = await conn.query(
        'SELECT hash, image FROM catalog_assets WHERE hash > ? ORDER BY hash LIMIT ' + Math.min(batchSize, remaining),
        [cursor],
      );
      if (rows.length === 0) break;

      // 小批并发：sharp 是异步的，4 路并发足够把 CPU 喂满，也不会把内存顶爆。
      for (let i = 0; i < rows.length; i += opts.concurrency) {
        const slice = rows.slice(i, i + opts.concurrency);
        const results = await Promise.all(slice.map(async (row) => {
          try {
            return { hash: row.hash, ok: await convertRow(sharp, opts, row) };
          } catch (error) {
            return { hash: row.hash, error: error.message };
          }
        }));
        for (const item of results) {
          if (item.error) {
            problems.push(item.hash + ': ' + item.error);
            console.error('[images] 失败 ' + item.hash + ' —— ' + item.error);
          } else {
            if (item.ok.skipped) skipped += 1;
            thumbBytes += item.ok.thumbBytes;
            displayBytes += item.ok.displayBytes;
          }
        }
        cursor = slice[slice.length - 1].hash;
        processed += slice.length;
      }

      const rate = processed / Math.max((Date.now() - startedAt) / 1000, 0.001);
      console.log('[images] ' + processed + '/' + total + ' 张（新增 ' + (processed - skipped) + '，跳过 ' + skipped
        + '），t ' + formatBytes(thumbBytes) + ' + d ' + formatBytes(displayBytes)
        + '，' + rate.toFixed(1) + ' 张/秒');
    }

    const previous = readManifest(opts.manifestDir);
    const manifest = previous && !previous.__parseError && previous.formatVersion === FORMAT_VERSION ? previous : {};
    manifest.formatVersion = FORMAT_VERSION;
    if (manifest.data === undefined) manifest.data = null;
    const thumbCount = countWebp(path.join(opts.out, 't'));
    const displayCount = countWebp(path.join(opts.out, 'd'));
    manifest.images = {
      exportedAt: new Date().toISOString(),
      format: 'webp',
      naming: 'sha256 of the decoded image bytes, same hash as catalog_assets.hash',
      thumbs: { dir: 'images/t', suffix: '.webp', width: opts.thumbWidth, quality: opts.thumbQuality, count: thumbCount, bytes: dirBytes(path.join(opts.out, 't')) },
      displays: { dir: 'images/d', suffix: '.webp', maxSize: opts.displaySize, quality: opts.displayQuality, count: displayCount, bytes: dirBytes(path.join(opts.out, 'd')) },
      processed: processed,
      skipped: skipped,
      problems: problems.slice(0, 20),
      totalBytes: dirBytes(path.join(opts.out, 't')) + dirBytes(path.join(opts.out, 'd')),
    };
    writeJsonAtomic(path.join(opts.manifestDir, 'manifest.json'), manifest);

    console.log('[images] 目录：' + path.relative(repoRoot, opts.out) + '/t（' + thumbCount + ' 张，'
      + formatBytes(manifest.images.thumbs.bytes) + '）、/d（' + displayCount + ' 张，'
      + formatBytes(manifest.images.displays.bytes) + '）');
    console.log('[images] manifest.images 已写入 manifest.json，data 段原样保留。');

    if (processed !== total) {
      console.error('[images] 异常：计划处理 ' + total + ' 张，实际只走了 ' + processed + ' 张（库是不是在变？）');
      process.exitCode = 1;
      return;
    }
    if (problems.length > 0) {
      console.error('[images] ' + problems.length + ' 张有问题，未通过：');
      for (const problem of problems.slice(0, 10)) console.error('         - ' + problem);
      process.exitCode = 1;
      return;
    }
    console.log('[images] 全部通过：' + total + ' 张图，两档共 ' + formatBytes(manifest.images.totalBytes) + '。');
  } finally {
    await conn.end();
  }
}

function countWebp(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((name) => name.endsWith('.webp')).length;
}

function dirBytes(dir) {
  if (!fs.existsSync(dir)) return 0;
  let sum = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.webp')) continue;
    sum += fs.statSync(path.join(dir, name)).size;
  }
  return sum;
}

function verifyImages(opts) {
  const manifest = readManifest(opts.manifestDir);
  if (!manifest || manifest.__parseError || !manifest.images) {
    console.error('[images] ' + opts.manifestDir + ' 里没有 images 段：先跑一次 npm run cloud:images');
    process.exitCode = 1;
    return;
  }
  const images = manifest.images;
  const thumbDir = path.join(opts.manifestDir, images.thumbs.dir);
  const displayDir = path.join(opts.manifestDir, images.displays.dir);
  const thumbCount = countWebp(thumbDir);
  const displayCount = countWebp(displayDir);
  const thumbBytes = dirBytes(thumbDir);
  const displayBytes = dirBytes(displayDir);
  console.log('[images] 校验 ' + opts.manifestDir);
  console.log('[images] 导出时间 ' + images.exportedAt + '，t 档 ' + thumbCount + ' 张 / ' + formatBytes(thumbBytes)
    + '，d 档 ' + displayCount + ' 张 / ' + formatBytes(displayBytes));
  const problems = [];
  if (images.thumbs.count !== thumbCount) problems.push('t 档张数：manifest ' + images.thumbs.count + '，实际 ' + thumbCount);
  if (images.displays.count !== displayCount) problems.push('d 档张数：manifest ' + images.displays.count + '，实际 ' + displayCount);
  if (images.thumbs.bytes !== thumbBytes) problems.push('t 档字节：manifest ' + images.thumbs.bytes + '，实际 ' + thumbBytes);
  if (images.displays.bytes !== displayBytes) problems.push('d 档字节：manifest ' + images.displays.bytes + '，实际 ' + displayBytes);
  if (thumbCount !== displayCount) problems.push('两档张数不一致：t ' + thumbCount + ' / d ' + displayCount);
  if (problems.length > 0) {
    console.error('[images] 失败 ' + problems.length + ' 项：');
    for (const problem of problems) console.error('         - ' + problem);
    process.exitCode = 1;
    return;
  }
  console.log('[images] 通过：产物与 manifest 一致。');
}

try {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.verify) verifyImages(opts);
  else await exportImages(opts);
} catch (error) {
  console.error('[images] ' + error.message);
  process.exitCode = 1;
}

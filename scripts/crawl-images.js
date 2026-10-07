import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFetcher } from './crawler/fetcher.js';
import {
  IMAGE_ALIASES,
  createImageResolvers,
  extFromContentType,
  extFromUrl,
  setImageFm,
} from './crawler/sources/image-sources.js';
import { findExistingFile, readEntityFile } from './crawler/writer.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_ROOT = path.join(ROOT, 'data');
const IMAGES_ROOT = path.join(DATA_ROOT, 'images');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function splitSpec(spec) {
  const i = spec.indexOf(':');
  return i === -1 ? [spec, undefined] : [spec.slice(0, i), spec.slice(i + 1)];
}

function findEntityFile(alias, sel) {
  const cfg = IMAGE_ALIASES[alias];
  for (const dir of cfg.dir) {
    const abs = path.join(DATA_ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    let file = null;
    if (/^\d+$/.test(sel)) {
      const hit = fs.readdirSync(abs).find((f) => f.startsWith(`${sel}_`) && f.endsWith('.md'));
      if (hit) file = hit;
    } else {
      const p = findExistingFile(abs, [sel]);
      if (p) file = path.basename(p);
    }
    if (file) return path.join(abs, file);
  }
  return null;
}

async function downloadFirst(resolvers, spec, alias, file, force) {
  const { fm, raw } = readEntityFile(file);
  const base = path.basename(file, '.md');
  const id = (/^(\d+)_/.exec(base) || [])[1] || '';
  const name = fm.name || base.replace(/^\d+_/, '');
  const cfg = IMAGE_ALIASES[alias];
  const relCurrent = fm.image ? String(fm.image) : '';
  const absCurrent = relCurrent ? path.join(IMAGES_ROOT, relCurrent) : '';
  if (relCurrent && fs.existsSync(absCurrent) && !force) {
    console.log(`[图片] ${spec} → ${relCurrent}（已存在，跳过）`);
    return { status: 'skip' };
  }
  if (!id) {
    console.log(`[图片] ${spec} → 文件名缺少 ID，暂不支持`);
    return { status: 'fail' };
  }
  for await (const step of resolvers.candidateSteps(alias, name)) {
    for (const url of step.urls) {
      let res;
      try {
        res = await binaryFetcher()(url);
      } catch {
        continue;
      }
      if (!res) continue;
      const ext = extFromContentType(res.contentType) || extFromUrl(url) || '.png';
      const rel = `${cfg.imgDir}/${id}${ext}`;
      const abs = path.join(IMAGES_ROOT, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, res.buf);
      const nextRaw = setImageFm(raw, rel);
      fs.writeFileSync(file, nextRaw, 'utf8');
      console.log(`[图片] ${spec} → images/${rel}（${step.step.type}，${res.buf.length} 字节）`);
      return { status: 'ok', rel };
    }
  }
  console.log(`[图片] ${spec} → 全部图源失败（${name}）`);
  return { status: 'fail' };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const checks = String(args.check || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const force = Boolean(args.force);
  if (!checks.length) {
    console.log('用法: node scripts/crawl-images.js --check <类型:名字或ID>[,...] [--force]');
    console.log(`  类型: ${Object.keys(IMAGE_ALIASES).join(' | ')}`);
    console.log('  下载到 data/images/，并回写 md front-matter image 字段');
    console.log('  --force: 已有图片时重新下载');
    console.log('  示例: node scripts/crawl-images.js --check agents:安比,characters:三月七,roles:三月七');
    process.exit(1);
  }

  const listFetcher = createFetcher({ rateLimitMs: 500, backoffMs: 5000, proxy: process.env.http_proxy || null });
  const wikiFetcher = createFetcher({ rateLimitMs: 9000, backoffMs: 30000, proxy: process.env.http_proxy || null });
  const resolvers = createImageResolvers({ listFetcher, wikiFetcher });

  const summary = { ok: 0, skip: 0, fail: 0 };
  for (const spec of checks) {
    const [alias, sel] = splitSpec(spec);
    if (!IMAGE_ALIASES[alias]) throw new Error(`未知图片目标类型 ${alias}（可用: ${Object.keys(IMAGE_ALIASES).join(', ')}）`);
    if (!sel) throw new Error(`--check ${alias} 需要 :名字 选择器`);
    const file = findEntityFile(alias, sel);
    if (!file) {
      console.log(`[图片] ${spec} → data 中未找到对应文件\n`);
      summary.fail += 1;
      continue;
    }
    const r = await downloadFirst(resolvers, spec, alias, file, force);
    summary[r.status] += 1;
  }

  console.log(`\n完成：成功 ${summary.ok}，跳过 ${summary.skip}，失败 ${summary.fail}`);
  process.exit(summary.fail > 0 ? 1 : 0);
}

let sharedBinary = null;
function binaryFetcher() {
  if (!sharedBinary) {
    const inner = createFetcher({ rateLimitMs: 400, backoffMs: 5000, proxy: process.env.http_proxy || null });
    sharedBinary = async (url) => {
      const res = await inner.get(url, { responseType: 'arraybuffer' });
      const ct = String(res.headers['content-type'] || '');
      if (!ct.startsWith('image/')) throw new Error(`非图片响应 ${ct}`);
      const buf = Buffer.from(res.data);
      if (buf.length < 512) throw new Error('图片过小');
      return { buf, contentType: ct };
    };
  }
  return sharedBinary;
}

main().catch((err) => {
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});

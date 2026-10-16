// 裁剪 dist 里的 demo-art/demo-data，并校验「产物里引用的 /demo-art/ 文件都真实存在」。
// 为什么需要它：.dockerignore 曾把 public/demo-art 整目录排除，导致容器里 vite build
// 时根本没有这些素材，线上首页三张世界卡片全部 404、全站字体静默退化成系统字体。
// 把这段检查放进构建，同类问题以后会在 CI 直接失败，而不是等上线后靠肉眼发现。
//
// 白名单（ orbital 主题真实引用的部分）：
//   covers/                首页三张世界卡片（AtlasEdition.jsx:32 / Visuals.jsx:7）
//   fonts/                 全站字体（open-index.css 的 @font-face）
//   根级 9 张插画          世界页 hero 图（AtlasEdition.jsx:46）+ 详情页肖像图（AtlasDetail.jsx:36）
// 删除：
//   previews/              只有 DemoApp 设计总览（#/gallery）与其他 theme 用得到
//   demo-data/             云端数据走 /api/catalog/*，不读 public/demo-data/index.json
import fs from 'node:fs';
import path from 'node:path';

const DIST = 'dist';
const DEMO = path.join(DIST, 'demo-art');
const KEEP_ROOT = [
  'zzz-1011.png', 'hsr-1224.png', 'zzz-1431.png', 'zzz-1371.png', 'zzz-1611.png',
  'hsr-1415.png', 'hsr-8007.png', 'hsr-1502.png', 'hsr-1001.png',
];
const REQUIRED = [
  'dist/index.html',
  'dist/demo-art/covers/zzz.png',
  'dist/demo-art/covers/hsr.png',
  'dist/demo-art/covers/currency.png',
  'dist/demo-art/fonts/edition-sans-core.woff2',
  'dist/demo-art/fonts/edition-serif-core.woff2',
];

function trim() {
  if (fs.existsSync(DEMO)) {
    for (const entry of fs.readdirSync(DEMO)) {
      if (entry === 'covers' || entry === 'fonts' || KEEP_ROOT.includes(entry)) continue;
      fs.rmSync(path.join(DEMO, entry), {recursive: true, force: true});
    }
  }
  fs.rmSync(path.join(DIST, 'demo-data'), {recursive: true, force: true});
}

const TEXT_FILE = /\.(css|js|mjs|html|json)$/;
const REF = /\/demo-art\/[A-Za-z0-9._\/-]+/g;

function collectRefs(dir, missing = new Set()) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectRefs(full, missing);
      continue;
    }
    if (!TEXT_FILE.test(entry.name)) continue;
    const text = fs.readFileSync(full, 'utf8');
    for (const match of text.matchAll(REF)) {
      if (!fs.existsSync(path.join(DIST, match[0]))) missing.add(match[0]);
    }
  }
  return missing;
}

function stat(dir) {
  let files = 0;
  let bytes = 0;
  const walk = d => {
    for (const entry of fs.readdirSync(d, {withFileTypes: true})) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        files += 1;
        bytes += fs.statSync(full).size;
      }
    }
  };
  walk(dir);
  return {files, bytes};
}

trim();
const missing = collectRefs(DIST);
if (missing.size) {
  console.error('dist 引用缺失: ' + [...missing].join(', '));
  process.exit(1);
}
for (const file of REQUIRED) {
  if (!fs.existsSync(file)) {
    console.error('dist asset missing: ' + file);
    process.exit(1);
  }
}
const {files, bytes} = stat(DIST);
console.log('dist ready: files=' + files + ' bytes=' + bytes + ' (' + (bytes / 1048576).toFixed(1) + ' MB)');

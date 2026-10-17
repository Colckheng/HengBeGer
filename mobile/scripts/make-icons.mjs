#!/usr/bin/env node
/**
 * 生成 App 图标与启动图（需要根目录 devDependency sharp）。
 *
 *   node mobile/scripts/make-icons.mjs
 *
 * 产出（全部进 mobile/assets/，git 跟踪）：
 *   icon.png           1024x1024  完整图标（深紫底 + 摊开的书）
 *   adaptive-icon.png  1024x1024  自适应图标前景（安全区内，背景色由 app.json 给）
 *   splash.png         1024x1024  启动图（透明底，只放图形）
 *   favicon.png        48x48
 *
 * 设计：深紫渐变底 + 摊开的书（图录）+ 右上角一颗琥珀色星。
 * 书是「图录 / 资料库」的通用符号，不用文字，缩到 48px 仍然认得出。
 *
 * 为什么换掉 Expo 默认图标：默认是青绿色网格底 + 白色 Android 机器人头，
 * 跟本项目深紫配色完全不搭，而且一眼就是「没配过的模板」。
 *
 * 注意：生成后要重跑 npm run mobile:patch —— apply-android-patches.mjs 负责把
 * assets/ 下的图标与启动图写进 android res。Expo 只在 prebuild 时读 app.json 的
 * icon 字段，而 android/ 是 gitignore 的产物目录，patch 脚本才是仓库里的真相源。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobileDir = path.resolve(here, '..');
const assetsDir = path.join(mobileDir, 'assets');

const SIZE = 1024;
// 主题色，与 app/_layout.tsx 的 headerStyle / src/ui/Bars.tsx 保持一致
const BG_DARK = '#0b0913';
const BG_MID = '#241f3a';
const PAGE = '#efe9ff';
const PAGE_LINE = '#b9b1d4';
const SPINE = '#6f5bd6';
const STAR = '#c98a3c';

/**
 * 摊开的书：左右两页 + 中缝 + 两行文字线 + 右上角一颗星。
 * scale 把同一个图形缩进不同画布（整幅图标 / 自适应前景 / 启动图）。
 */
function book(scale = 1) {
  const cx = 512 * scale;
  const top = 356 * scale;
  const bottom = 704 * scale;
  const half = 252 * scale;
  const left = cx - half;
  const right = cx + half;
  const line1 = top + (bottom - top) * 0.26;
  const line2 = top + (bottom - top) * 0.46;
  const lineW = 150 * scale;
  return `
    <g>
      <path d="M ${cx} ${top}
               L ${left + 20 * scale} ${top - 28 * scale}
               Q ${left} ${top - 34 * scale} ${left} ${top - 12 * scale}
               L ${left} ${bottom - 30 * scale}
               Q ${left} ${bottom - 4 * scale} ${left + 20 * scale} ${bottom}
               L ${cx} ${bottom - 32 * scale} Z" fill="${PAGE}"/>
      <path d="M ${cx} ${top}
               L ${right - 20 * scale} ${top - 28 * scale}
               Q ${right} ${top - 34 * scale} ${right} ${top - 12 * scale}
               L ${right} ${bottom - 30 * scale}
               Q ${right} ${bottom - 4 * scale} ${right - 20 * scale} ${bottom}
               L ${cx} ${bottom - 32 * scale} Z" fill="${PAGE}"/>
      <rect x="${cx - 10 * scale}" y="${top - 14 * scale}" width="${20 * scale}"
            height="${bottom - top - 10 * scale}" rx="${10 * scale}" fill="${SPINE}"/>
      <rect x="${left + 42 * scale}" y="${line1}" width="${lineW}" height="${15 * scale}" rx="${7.5 * scale}" fill="${PAGE_LINE}"/>
      <rect x="${left + 42 * scale}" y="${line2}" width="${lineW * 0.72}" height="${15 * scale}" rx="${7.5 * scale}" fill="${PAGE_LINE}"/>
      <rect x="${right - 42 * scale - lineW}" y="${line1}" width="${lineW}" height="${15 * scale}" rx="${7.5 * scale}" fill="${PAGE_LINE}"/>
      <rect x="${right - 42 * scale - lineW * 0.72}" y="${line2}" width="${lineW * 0.72}" height="${15 * scale}" rx="${7.5 * scale}" fill="${PAGE_LINE}"/>
      <path d="M ${cx + 176 * scale} ${top - 96 * scale}
               L ${cx + 196 * scale} ${top - 136 * scale}
               L ${cx + 216 * scale} ${top - 96 * scale}
               L ${cx + 256 * scale} ${top - 76 * scale}
               L ${cx + 216 * scale} ${top - 56 * scale}
               L ${cx + 196 * scale} ${top - 16 * scale}
               L ${cx + 176 * scale} ${top - 56 * scale}
               L ${cx + 136 * scale} ${top - 76 * scale} Z" fill="${STAR}"/>
    </g>`;
}

function svg({ background = 'gradient', scale = 1 }) {
  const bg = background === 'gradient'
    ? `<defs><linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
         <stop offset="0" stop-color="${BG_MID}"/>
         <stop offset="1" stop-color="${BG_DARK}"/>
       </linearGradient></defs>
       <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>`
    : '';
  return `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"
     xmlns="http://www.w3.org/2000/svg">${bg}${book(scale)}</svg>`;
}

async function write(name, buffer) {
  const target = path.join(assetsDir, name);
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(target, buffer);
  const { width, height } = await sharp(buffer).metadata();
  console.log('  ' + name + '  ' + width + 'x' + height + '  ' + buffer.length + ' B');
}

fs.mkdirSync(assetsDir, { recursive: true });
console.log('生成图标 → ' + assetsDir);

// 1. 完整图标：整幅渐变底（legacy mipmap / 各端默认）
await write('icon.png', await sharp(Buffer.from(svg({ background: 'gradient', scale: 1 }))).png().toBuffer());
// 2. 自适应图标前景：透明底，图形缩到安全区（108dp 的 66% ≈ 712px）
await write('adaptive-icon.png', await sharp(Buffer.from(svg({ background: 'none', scale: 0.66 }))).png().toBuffer());
// 3. 启动图：透明底，图形放大一点（启动图没有图标那么小）
await write('splash.png', await sharp(Buffer.from(svg({ background: 'none', scale: 0.5 }))).png().toBuffer());
// 4. favicon：直接缩 icon，别让浏览器再用 Expo 默认
await write('favicon.png', await sharp(Buffer.from(svg({ background: 'gradient', scale: 1 }))).resize(48, 48).png().toBuffer());

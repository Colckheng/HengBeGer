#!/usr/bin/env node
/**
 * scripts/build-open-index-css.mjs
 *
 * 把 src/demo/ 的设计稿 CSS 机械地变换成「作用域化」副本，供正式站的开放图录页面使用。
 *
 * 背景：demo 的 CSS 带一批裸元素选择器（html / body / * / button / a / img / h1-h4 /
 * p / figure / section / article / aside / small / button:disabled / :focus-visible /
 * ::selection / :root）。直接全局 import 会污染旧路由（/zzz-wiki、/hsr-wiki、
 * admin、旧首页）。本脚本只做一件事：把每条规则重写到 .open-index 作用域里。
 *
 * 产物（src/open-index/）
 *   open-index.css         —— OpenIndex.jsx 唯一 import 的入口，自包含（内联 @font-face
 *                             与全部作用域化规则，按 src/demo/main.jsx 的原次序）。
 *   demo-v3.css            —— demo-v3.css 的单文件作用域化副本（供审计/比对）。
 *   demo-refinement.css    —— demo-refinement.css 的单文件作用域化副本（供审计/比对）。
 *
 * 作用域映射
 *   *                    -> .open-index, .open-index *, .open-index *::before, .open-index *::after
 *   html / body / :root  -> .open-index                      （宿主元素自身）
 *   :focus-visible 等裸伪类 -> .open-index :focus-visible
 *   .is-home / .is-inner -> .open-index.is-home              （状态类与 .open-index 同元素！）
 *   .demo / .demo.theme-orbital -> .open-index               （两处变量定义都落在宿主上）
 *   .theme-orbital ...   -> .open-index.theme-orbital ...
 *   其他                  -> .open-index <selector>            （普通后代前缀）
 *
 * ⚠ 为什么必须特判 .is-home / .is-inner：
 *   demo 的 DOM 根是 <div class="demo theme-orbital is-home">，状态类与 .demo 在**同一个元素**上。
 *   若按普通后代前缀处理，会生成 .open-index .is-home（要求 is-home 是 .open-index 的**后代**），
 *   该选择器永远不匹配 —— 实测会静默废掉 196 条规则 / 约 416 条声明。
 *   正确形式是 .open-index.is-home（复合，无空格）。
 *
 * ⚠ 为什么用「最左侧复合选择器不含 . # [」而不是「不含 :」：
 *   button:disabled、*:before、:focus-visible、::selection 都不含 . # [，但含伪类/伪元素；
 *   只按「不含 :」判断会把它们漏成全局规则，仍然污染旧页面。本判据是它的超集。
 *
 * 无第三方依赖：只用 node:fs / node:path + 手写花括号配对扫描器。
 *
 * 用法：
 *   node scripts/build-open-index-css.mjs                 # 生成
 *   node scripts/build-open-index-css.mjs --check         # 只自检，不写文件
 *   node scripts/build-open-index-css.mjs --check --verbose
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SRC_DIR = path.join(ROOT, 'src', 'demo');
const OUT_DIR = path.join(ROOT, 'src', 'open-index');

/** 需要处理的输入文件（顺序即 src/demo/main.jsx 的 import 顺序） */
export const SOURCES = [
  'fonts.css',
  'edition-fonts.css',
  'demo-v3.css',
  'demo-refinement.css',
  'atlas-edition.css',
  'atlas-collection.css',
  'atlas-detail.css',
];

/** 需要额外产出「单文件作用域化副本」的输入 */
const PART_FILES = ['demo-v3.css', 'demo-refinement.css'];

const SCOPE = '.open-index';
const SCOPED_THEME = '.open-index.theme-orbital';

/** 这些 at-rule 的 body 里是样式规则，需要递归作用域化 */
const NESTED_AT = new Set(['@media', '@supports', '@layer', '@container', '@scope', '@document']);

const GENERATED_BY = 'scripts/build-open-index-css.mjs';

// ================================================================ 扫描工具

/** 找到与 openIndex 处的 '{' 配对的 '}'（跳过字符串与注释），返回该 '}' 的下标 */
function matchBrace(src, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < src.length; i++) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      for (i++; i < src.length && src[i] !== q; i++) if (src[i] === '\\') i++;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  throw new Error('未配对的 { —— 输入 CSS 结构异常');
}

/** 跳过空白、字符串与注释，返回下一个有效字符的下标（找不到返回 -1） */
function nextSignificant(src, from) {
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (/\s/.test(c)) continue;
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      for (i++; i < src.length && src[i] !== q; i++) if (src[i] === '\\') i++;
      continue;
    }
    return i;
  }
  return -1;
}

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
}

/** 按顶层分隔符切分（忽略 (), [] 与字符串内部） */
function splitTop(text, sep) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      const q = c;
      cur += c;
      for (i++; i < text.length && text[i] !== q; i++) {
        if (text[i] === '\\') { cur += text[i]; i++; }
        cur += text[i];
      }
      if (i < text.length) cur += text[i];
      continue;
    }
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    if (c === sep && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  parts.push(cur);
  return parts;
}

/** 按顶层逗号切分选择器列表 */
export function splitSelectorList(selector) {
  return splitTop(selector, ',');
}

/** 取一个选择器片段最左侧的复合选择器（到第一个顶层组合符为止） */
export function leftmostCompound(fragment) {
  const s = fragment.trim();
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'") {
      const q = c;
      for (i++; i < s.length && s[i] !== q; i++) if (s[i] === '\\') i++;
      continue;
    }
    if (c === '(' || c === '[') { depth++; continue; }
    if (c === ')' || c === ']') { depth--; continue; }
    if (depth === 0 && (c === '>' || c === '+' || c === '~')) return s.slice(0, i);
    if (depth === 0 && /\s/.test(c)) return s.slice(0, i);
  }
  return s;
}

/**
 * 判断一个选择器片段是否需要作用域前缀。
 * 判据：最左侧复合选择器里不含 . / # / [ —— 说明它可能命中页面里任意元素。
 */
export function needsScope(fragment) {
  const t = fragment.trim();
  if (!t) return false;
  const compound = leftmostCompound(t);
  if (!compound) return false;
  return !/[.#\[]/.test(compound);
}

/** 状态类：与 .demo / .open-index 位于同一个元素上，必须做复合而不是后代 */
const ROOT_STATE = /^\.(is-home|is-inner)(?![A-Za-z0-9_-])/;

const DEMO_TOKEN = /\.demo(?![A-Za-z0-9_-])/g;

/**
 * 把一个「不含逗号」的复杂选择器作用域化成 1..n 条。
 * 顺序即优先级，务必先判特例再落到通用前缀。
 */
export function scopeComplex(s) {
  if (s === '*') {
    return [SCOPE, SCOPE + ' *', SCOPE + ' *::before', SCOPE + ' *::after'];
  }
  if (/^\*::?before$/.test(s)) return [SCOPE + ' *::before'];
  if (/^\*::?after$/.test(s)) return [SCOPE + ' *::after'];
  if (s === ':root') return [SCOPE];
  if (/^html(?![A-Za-z0-9_-])/.test(s)) return [s.replace(/^html/, SCOPE)];
  if (/^body(?![A-Za-z0-9_-])/.test(s)) return [s.replace(/^body/, SCOPE)];
  // 状态类与宿主同元素 —— 必须复合，否则生成永远不匹配的后代选择器
  if (ROOT_STATE.test(s)) return [SCOPE + s];
  if (s.startsWith(':')) return [SCOPE + ' ' + s];
  if (DEMO_TOKEN.test(s)) {
    DEMO_TOKEN.lastIndex = 0;
    return [s.replace(DEMO_TOKEN, SCOPE)];
  }
  DEMO_TOKEN.lastIndex = 0;
  if (s.startsWith('.theme-orbital')) return [s.replace(/^\.theme-orbital/, SCOPED_THEME)];
  return [SCOPE + ' ' + s];
}

/** 作用域化一整条选择器列表（逗号逐项判断，去重保序） */
export function scopeSelector(selector) {
  const out = [];
  const seen = new Set();
  for (const part of splitSelectorList(selector)) {
    const s = part.trim();
    if (!s) continue;
    for (const scoped of scopeComplex(s)) {
      if (!seen.has(scoped)) { seen.add(scoped); out.push(scoped); }
    }
  }
  return out.join(',');
}

// ================================================================ 变换核心

/**
 * 扫描一段 CSS，输出作用域化后的文本，并累计统计。
 * 只处理顶层规则；at-rule 按类型递归或原样保留。
 */
function transformBlock(src, stats) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const start = nextSignificant(src, i);
    if (start === -1) { out += src.slice(i); break; }

    if (src[start] === '@') {
      let braceAt = -1;
      let semiAt = -1;
      for (let j = start + 1; j < src.length; j++) {
        const c = src[j];
        if (c === '/' && src[j + 1] === '*') {
          const end = src.indexOf('*/', j + 2);
          j = end === -1 ? src.length : end + 1;
          continue;
        }
        if (c === '{') { braceAt = j; break; }
        if (c === ';') { semiAt = j; break; }
      }
      if (braceAt === -1) {
        const end = semiAt === -1 ? src.length : semiAt + 1;
        out += src.slice(i, end);
        i = end;
        continue;
      }
      const prelude = src.slice(start, braceAt).trim();
      const close = matchBrace(src, braceAt);
      const body = src.slice(braceAt + 1, close);
      const head = prelude.split(/[\s(]/)[0].toLowerCase();
      if (NESTED_AT.has(head)) {
        out += src.slice(i, braceAt + 1);
        out += transformBlock(body, stats);
        out += '}';
      } else {
        // @font-face / @keyframes / @page / @property … 内部一字不动
        stats.atRules += 1;
        stats.atRuleDecls += countDeclarations(body);
        out += src.slice(i, close + 1);
      }
      i = close + 1;
      continue;
    }

    let braceAt = -1;
    for (let j = start; j < src.length; j++) {
      const c = src[j];
      if (c === '/' && src[j + 1] === '*') {
        const end = src.indexOf('*/', j + 2);
        j = end === -1 ? src.length : end + 1;
        continue;
      }
      if (c === '"' || c === "'") {
        const q = c;
        for (j++; j < src.length && src[j] !== q; j++) if (src[j] === '\\') j++;
        continue;
      }
      if (c === '{') { braceAt = j; break; }
      if (c === '}') break;
    }
    if (braceAt === -1) { out += src.slice(i); break; }

    const selector = src.slice(start, braceAt);
    const close = matchBrace(src, braceAt);
    const body = src.slice(braceAt + 1, close);

    stats.rules += 1;
    stats.declarations += countDeclarations(body);
    out += src.slice(i, start);
    out += scopeSelector(selector);
    out += src.slice(braceAt, close + 1);
    i = close + 1;
  }
  return out;
}

/** 统计一段文本里的顶层声明数（按 ';' 分隔的非空片段） */
export function countDeclarations(body) {
  const src = stripComments(body);
  let depth = 0;
  let count = 0;
  let seg = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'") {
      const q = c;
      seg += c;
      for (i++; i < src.length && src[i] !== q; i++) {
        if (src[i] === '\\') { seg += src[i]; i++; }
        seg += src[i];
      }
      if (i < src.length) seg += src[i];
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    if (c === ';' && depth === 0) { if (seg.trim()) count++; seg = ''; continue; }
    seg += c;
  }
  if (depth === 0 && seg.trim()) count++;
  return count;
}

function emptyStats() {
  return { rules: 0, declarations: 0, atRules: 0, atRuleDecls: 0 };
}

/** 统计顶层规则块 / 声明总数 / at-rule 数 */
export function countStats(css) {
  const stats = emptyStats();
  transformBlock(css, stats);
  return stats;
}

// ================================================================ 自检

/** 收集输出里所有顶层选择器片段（递归进 @media/@supports 等） */
export function collectTopLevelSelectorParts(css) {
  const parts = [];
  const src = stripComments(css);
  const walk = (text) => {
    let i = 0;
    while (i < text.length) {
      const s = nextSignificant(text, i);
      if (s === -1) break;
      if (text[s] === '@') {
        let braceAt = -1;
        let semiAt = -1;
        for (let j = s + 1; j < text.length; j++) {
          if (text[j] === '{') { braceAt = j; break; }
          if (text[j] === ';') { semiAt = j; break; }
        }
        if (braceAt === -1) { i = semiAt === -1 ? text.length : semiAt + 1; continue; }
        const head = text.slice(s, braceAt).trim().split(/[\s(]/)[0].toLowerCase();
        const close = matchBrace(text, braceAt);
        if (NESTED_AT.has(head)) walk(text.slice(braceAt + 1, close));
        i = close + 1;
        continue;
      }
      let j = s;
      while (j < text.length && text[j] !== '{' && text[j] !== '}') j++;
      if (j >= text.length || text[j] === '}') { i = j + 1; continue; }
      for (const p of splitSelectorList(text.slice(s, j))) parts.push(p.trim());
      const close = matchBrace(text, j);
      i = close + 1;
    }
  };
  walk(src);
  return parts;
}

/**
 * 自检：
 *  1. 声明块数量与声明总数与输入完全一致（变换只改选择器，不改声明）；
 *  2. 输出中不存在未作用域的顶层选择器；
 *  3. 输出中不存在裸 html / body / :root；
 *  4. 输出中不存在永远不匹配的 `.open-index .is-home` 后代形式。
 */
export function verify(inputCss, outputCss) {
  const problems = [];
  const before = countStats(inputCss);
  const after = countStats(outputCss);

  if (before.rules !== after.rules) {
    problems.push('声明块数量不一致：输入 ' + before.rules + ' vs 输出 ' + after.rules);
  }
  if (before.declarations !== after.declarations) {
    problems.push('声明总数不一致：输入 ' + before.declarations + ' vs 输出 ' + after.declarations);
  }
  if (before.atRules !== after.atRules) {
    problems.push('at-rule 数量不一致：输入 ' + before.atRules + ' vs 输出 ' + after.atRules);
  }

  let unscoped = 0;
  const samples = [];
  for (const p of collectTopLevelSelectorParts(outputCss)) {
    if (needsScope(p)) {
      unscoped++;
      if (samples.length < 8) samples.push(p);
    }
  }
  if (unscoped > 0) {
    problems.push('残留未作用域顶层选择器 ' + unscoped + ' 个：' + samples.join(' | '));
  }

  const clean = stripComments(outputCss);
  for (const leaf of ['html', 'body', ':root']) {
    const re = new RegExp('(^|[},;])[ \\t\\n]*' + leaf.replace(':', '\\:') + '[ \\t\\n]*(,|\\{)', 'm');
    if (re.test(clean)) problems.push('输出中仍存在裸 ' + leaf + ' 选择器');
  }

  const deadState = (clean.match(/\.open-index\s+\.is-(home|inner)(?![A-Za-z0-9_-])/g) || []).length;
  if (deadState > 0) {
    problems.push('存在永远不匹配的 `.open-index .is-home/.is-inner` 后代选择器 ' + deadState + ' 处');
  }

  return { problems, before, after, unscoped, deadState };
}

// ================================================================ 主流程

function banner(rel) {
  return '/* 由 ' + GENERATED_BY + ' 从 ' + rel + ' 生成，请勿手改。\n'
    + '   源文件：' + rel + '\n'
    + '   重新生成：node ' + GENERATED_BY + ' */\n';
}

const ENTRY_HEADER = [
  '/* ===========================================================================',
  ' * 开放图录 THE OPEN INDEX —— 正式站样式入口（自包含，只被 OpenIndex.jsx import）',
  ' *',
  ' * GENERATED FILE —— 请勿手改。',
  ' * 由 ' + GENERATED_BY + ' 从 src/demo/*.css 机械变换生成。',
  ' * 重新生成：node ' + GENERATED_BY,
  ' *',
  ' * 作用域：全部规则重写到 .open-index（主题规则 .open-index.theme-orbital），',
  ' * 因此 import 本文件不会把 html / body / * / button / a / img 等规则泄漏到',
  ' * 旧路由（/zzz-wiki、/hsr-wiki、admin、旧首页）。声明逐字复制自 src/demo/**，',
  ' * 只改选择器。',
  ' *',
  ' * 来源次序与 src/demo/main.jsx 完全一致：',
  ' *   fonts -> edition-fonts -> demo-v3 -> demo-refinement',
  ' *   -> atlas-edition -> atlas-collection -> atlas-detail',
  ' * =========================================================================== */',
  '',
].join('\n');

function main() {
  const argv = process.argv.slice(2);
  const checkOnly = argv.includes('--check');
  const verbose = argv.includes('--verbose');

  let failures = 0;
  const report = [];
  const transformed = new Map();

  for (const name of SOURCES) {
    const srcPath = path.join(SRC_DIR, name);
    const rel = 'src/demo/' + name;
    const input = fs.readFileSync(srcPath, 'utf8').replace(/\r\n/g, '\n');
    const stats = emptyStats();
    const body = transformBlock(input, stats);
    const { problems, before, after, unscoped, deadState } = verify(input, body);
    transformed.set(name, body);

    report.push({
      name: rel, rules: after.rules, declarations: after.declarations,
      atRules: after.atRules, unscoped, deadState, problems,
      inBytes: Buffer.byteLength(input, 'utf8'),
      outBytes: Buffer.byteLength(body, 'utf8'),
    });

    if (problems.length) {
      failures += problems.length;
      console.error('\n\u2717 ' + rel);
      for (const p of problems) console.error('    ' + p);
    } else if (verbose) {
      console.log('\u2713 ' + rel + '：规则块 ' + after.rules + '，声明 ' + after.declarations
        + '，at-rule ' + after.atRules + '，未作用域 ' + unscoped
        + '，死状态选择器 ' + deadState);
    }
  }

  // ---- 组装入口 open-index.css
  const sections = SOURCES.map((name) => {
    const rel = 'src/demo/' + name;
    return '/* ===== source: ' + rel + ' ===== */\n' + banner(rel) + transformed.get(name).replace(/^\s+/, '');
  });
  const entry = (ENTRY_HEADER + sections.join('\n\n')).trimEnd() + '\n';
  const outputs = new Map([['open-index.css', entry]]);
  for (const name of PART_FILES) {
    const rel = 'src/demo/' + name;
    outputs.set(name, (banner(rel) + transformed.get(name).replace(/^\s+/, '')).trimEnd() + '\n');
  }

  const entryStats = countStats(entry.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length)));
  const entryProblems = [];
  const totalBefore = report.reduce((a, r) => a + r.rules, 0);
  const totalBeforeDecls = report.reduce((a, r) => a + r.declarations, 0);
  if (entryStats.rules !== totalBefore) {
    entryProblems.push('入口文件规则块总数 ' + entryStats.rules + ' ≠ 各源文件之和 ' + totalBefore);
  }
  if (entryStats.declarations !== totalBeforeDecls) {
    entryProblems.push('入口文件声明总数 ' + entryStats.declarations + ' ≠ 各源文件之和 ' + totalBeforeDecls);
  }
  {
    let unscoped = 0;
    const samples = [];
    for (const p of collectTopLevelSelectorParts(entry)) {
      if (needsScope(p)) { unscoped++; if (samples.length < 8) samples.push(p); }
    }
    if (unscoped) entryProblems.push('入口文件残留未作用域顶层选择器 ' + unscoped + ' 个：' + samples.join(' | '));
    const dead = (stripComments(entry).match(/\.open-index\s+\.is-(home|inner)(?![A-Za-z0-9_-])/g) || []).length;
    if (dead) entryProblems.push('入口文件存在死状态选择器 ' + dead + ' 处');
  }
  if (checkOnly) {
    for (const [name, expected] of outputs) {
      const file = path.join(OUT_DIR, name);
      if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== expected) {
        entryProblems.push('生成文件缺失或与源码不一致：src/open-index/' + name + '；请重新生成');
      }
    }
  }
  if (entryProblems.length) {
    failures += entryProblems.length;
    console.error('\n\u2717 src/open-index/open-index.css');
    for (const p of entryProblems) console.error('    ' + p);
  }

  // ---- 写出
  if (!checkOnly && !failures) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    for (const [name, content] of outputs) {
      fs.writeFileSync(path.join(OUT_DIR, name), content, 'utf8');
    }
  }

  // ---- 报告
  console.log('');
  console.log('=== build-open-index-css 自检报告 ===');
  for (const r of report) {
    console.log((r.problems.length ? '\u2717' : '\u2713') + ' ' + r.name
      + '  ->  ' + (r.problems.length ? '(未写出)' : 'ok'));
    console.log('    规则块 ' + r.rules + '   声明 ' + r.declarations + '   at-rule ' + r.atRules
      + '   未作用域 ' + r.unscoped + '   死状态选择器 ' + r.deadState);
    console.log('    ' + r.inBytes + ' B -> ' + r.outBytes + ' B');
  }
  console.log((entryProblems.length ? '\u2717' : '\u2713') + ' src/open-index/open-index.css');
  console.log('    规则块 ' + entryStats.rules + '   声明 ' + entryStats.declarations
    + '   at-rule ' + entryStats.atRules + '   ' + Buffer.byteLength(entry, 'utf8') + ' B');
  console.log('    单文件副本：' + PART_FILES.map((f) => 'src/open-index/' + f).join('、'));

  if (failures) {
    console.error('');
    console.error('自检失败：' + failures + ' 个问题');
    process.exit(1);
  }
  console.log('');
  console.log('自检通过：声明块数与声明总数与输入完全一致，未作用域顶层选择器 0，死状态选择器 0。');
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();

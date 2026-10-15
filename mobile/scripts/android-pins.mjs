#!/usr/bin/env node
/**
 * 生成 Android 证书固定（certificate pinning）需要的文件：
 *   native/cloud_server.pem                     云端 ECS 自签证书（公开信息，可进仓库）
 *   native/server.pem                          本机预演栈证书（可选：deploy/ssl/ 不进仓库，没有就跳过）
 *   native/network_security_config.xml          release 用：只信任上面的证书，禁明文
 *   native/network_security_config.debug.xml    debug 用：同上，但放开明文（Metro 走 http）
 *
 * 为什么用 <certificates src="@raw/..."> 而不是 <pin-set>：
 *   Android 的解析器只允许 <pin-set> 出现在 <domain-config> 里，放进 <base-config> 会在
 *   Application 初始化时抛 ParserException: pin-set element not allowed in base-config，
 *   App 一启动就闪退；而 <domain-config> 必须写死域名/IP，与「服务器地址可配置」冲突。
 *   源码：frameworks/base/core/java/android/security/net/config/XmlConfigSource.java:270-274
 *   （line 255-259 对 <domain> 有同样限制）。@raw 信任锚在 base-config 里合法，
 *   且与主机名无关 —— 主机名校验仍由证书自己的 SAN 决定，所以换 IP 要重签证书。
 *
 * 为什么信任锚可以有多个：App 里服务器地址是用户可填的（云端 / 本机预演 / 局域网真机），
 *   信任锚按证书列，不是按地址列；列两张就能同时连云端与预演栈，而不会放松到信任公共 CA。
 *
 *   node mobile/scripts/android-pins.mjs --dir mobile/native
 *   node mobile/scripts/android-pins.mjs --cert /path/extra.crt     # 额外再加一张信任锚
 */
import fs from 'node:fs';
import path from 'node:path';
import { X509Certificate } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// 仓库根：CLOUD_CERT / PREVIEW_CERT 是相对仓库根写的常量，
// 但脚本可能从 mobile/ 目录被调用（npm --prefix mobile run …），所以要显式定位。
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// 相对路径先按当前工作目录找，找不到再按仓库根找（两个位置都找不到时按 cwd 报错，错误信息里是用户写的那条路径）。
function resolveSource(source) {
  if (path.isAbsolute(source)) return source;
  const fromCwd = path.resolve(source);
  if (fs.existsSync(fromCwd)) return fromCwd;
  const fromRoot = path.resolve(REPO_ROOT, source);
  if (fs.existsSync(fromRoot)) return fromRoot;
  return fromCwd;
}

// 云端证书的「真相来源」：ECS 上 deploy/scripts/make-cert.mjs 的产物，拷进仓库便于复现。
export const CLOUD_CERT = path.join('deploy', 'certs', 'cloud-server.crt');
// 本机预演栈证书：deploy/ssl/ 被 .gitignore 排除，新克隆的仓库里没有，所以是可选的。
export const PREVIEW_CERT = path.join('deploy', 'ssl', 'server.crt');
export const CONFIG_FILE = 'network_security_config.xml';
export const DEBUG_CONFIG_FILE = 'network_security_config.debug.xml';

function parseArgs(argv) {
  const options = { dir: 'mobile/native', extra: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--cert') options.extra.push(argv[++i]);
    else if (arg === '--dir') options.dir = argv[++i];
    else if (arg === '-h' || arg === '--help') options.help = true;
    else throw new Error('未知参数：' + arg);
  }
  return options;
}

// res/raw 资源名只能是小写字母数字下划线，且必须以字母开头。
export function rawNameFor(source) {
  const base = path.basename(source, path.extname(source)).replace(/[^A-Za-z0-9_]/g, '_');
  return /^[A-Za-z]/.test(base) ? base : 'cert_' + base;
}

/**
 * 信任锚清单：按顺序 = 云端（必需）→ 预演（存在才加）→ --cert 额外指定的（必需）。
 * 同一张证书只保留一次（按内容指纹去重，避免 pem 与 crt 两份拷贝互相打架）。
 */
export function planAnchors({ cloud = CLOUD_CERT, preview = PREVIEW_CERT, extra = [] } = {}) {
  const candidates = [
    { source: cloud, required: true, note: '云端 ECS' },
    { source: preview, required: false, note: '本机预演栈' },
    ...extra.map((source) => ({ source, required: true, note: '--cert 指定' })),
  ];
  const plan = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const resolved = resolveSource(candidate.source);
    if (!fs.existsSync(resolved)) {
      if (candidate.required) throw new Error('缺少证书 ' + candidate.source + '（' + candidate.note + '）：先把服务器上的 deploy/ssl/server.crt 拷到 deploy/certs/cloud-server.crt');
      continue;
    }
    const pem = fs.readFileSync(resolved, 'utf8');
    const certificate = new X509Certificate(pem);
    if (seen.has(certificate.fingerprint256)) continue;
    seen.add(certificate.fingerprint256);
    plan.push({
      source: candidate.source,
      note: candidate.note,
      raw: rawNameFor(candidate.source),
      file: rawNameFor(candidate.source) + '.pem',
      pem,
      certificate,
    });
  }
  return plan;
}

export function securityConfigXml({ cleartext = false, anchors = ['cloud_server'] } = {}) {
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<!-- 自签证书：整个 App 只信任下面 res/raw 里列出的证书，不信任任何公共 CA。',
    '     不要改成 <pin-set>：Android 只允许它出现在 <domain-config> 里，放进 base-config 会在',
    '     App 启动时抛 "pin-set element not allowed in base-config" 直接闪退；而 domain-config',
    '     必须写死域名/IP，与「服务器地址可配置」冲突。@raw 信任锚在 base-config 里合法。',
    (cleartext
      ? '     debug 变体：cleartextTrafficPermitted=true —— 设了 networkSecurityConfig 之后，'
      : '     release 变体：cleartextTrafficPermitted=false —— 禁止一切明文流量。'),
    (cleartext
      ? '     debug manifest 里的 usesCleartextTraffic 会被忽略，而 Metro 是 http://，不放开加载不了 JS。 -->'
      : '     Metro 的 http://localhost:8081 只在 debug 变体里放开（见 network_security_config.debug.xml）。 -->'),
    '<network-security-config>',
    '  <base-config cleartextTrafficPermitted="' + (cleartext ? 'true' : 'false') + '">',
    '    <trust-anchors>',
    ...anchors.map((raw) => '      <certificates src="@raw/' + raw + '" />'),
    '    </trust-anchors>',
    '  </base-config>',
    '</network-security-config>',
    '',
  ];
  return lines.join('\n');
}

function writeIfChanged(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  if (existing === content) return { target, changed: false };
  fs.writeFileSync(target, content, 'utf8');
  return { target, changed: true };
}

// 上一版只信任一张证书（hengbeger_server.pem），换方案后要清掉，免得 res/raw 里留着没人用的锚。
export function removeStaleAnchors(dir, keep) {
  const removed = [];
  if (!fs.existsSync(dir)) return removed;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.pem') || keep.includes(name)) continue;
    fs.rmSync(path.join(dir, name));
    removed.push(path.join(dir, name));
  }
  return removed;
}

export function generate({ dir, cloud, preview, extra } = {}) {
  const anchors = planAnchors({ cloud, preview, extra });
  const written = anchors.map((anchor) => writeIfChanged(path.join(dir, anchor.file), anchor.pem));
  const rawNames = anchors.map((anchor) => anchor.raw);
  written.push(writeIfChanged(path.join(dir, CONFIG_FILE), securityConfigXml({ cleartext: false, anchors: rawNames })));
  written.push(writeIfChanged(path.join(dir, DEBUG_CONFIG_FILE), securityConfigXml({ cleartext: true, anchors: rawNames })));
  const removed = removeStaleAnchors(dir, anchors.map((anchor) => anchor.file));
  return { anchors, written, removed };
}

if (import.meta.url === 'file://' + process.argv[1] || process.argv[1]?.endsWith('android-pins.mjs')) {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('用法：node mobile/scripts/android-pins.mjs [--dir mobile/native] [--cert 额外证书.crt]...');
    process.exit(0);
  }
  try {
    const { anchors, written, removed } = generate(options);
    console.log('信任锚 ' + anchors.length + ' 张：');
    for (const anchor of anchors) {
      console.log('  ' + anchor.note + '：' + anchor.source);
      console.log('    subject：' + anchor.certificate.subject.replace(/\n/g, ', '));
      console.log('    有效期至：' + anchor.certificate.validTo);
      console.log('    SAN：' + String(anchor.certificate.subjectAltName || '(无)').replace(/\n/g, ', '));
      console.log('    res/raw/' + anchor.raw);
    }
    for (const file of written) {
      console.log((file.changed ? '已写入 ' : '已是最新 ') + path.relative(process.cwd(), file.target));
    }
    for (const target of removed) {
      console.log('已删除（不再需要的信任锚） ' + path.relative(process.cwd(), target));
    }
  } catch (error) {
    console.error('[FAIL] ' + error.message);
    process.exit(1);
  }
}

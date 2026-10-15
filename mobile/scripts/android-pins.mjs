#!/usr/bin/env node
/**
 * 生成 Android 证书固定（certificate pinning）需要的文件：
 *   1. native/hengbeger_server.pem                自签证书本体（公开信息，可进仓库）
 *   2. native/network_security_config.xml          release 用：只信任上面那张证书，禁明文
 *   3. native/network_security_config.debug.xml    debug 用：同上，但放开明文（Metro 走 http）
 *
 * 为什么用 <certificates src="@raw/..."> 而不是 <pin-set>：
 *   Android 的解析器只允许 <pin-set> 出现在 <domain-config> 里，放进 <base-config> 会在
 *   Application 初始化时抛 ParserException: pin-set element not allowed in base-config，
 *   App 一启动就闪退；而 <domain-config> 必须写死域名/IP，与「服务器地址可配置」冲突。
 *   源码：frameworks/base/core/java/android/security/net/config/XmlConfigSource.java:270-274
 *   （line 255-259 对 <domain> 有同样限制）。@raw 信任锚在 base-config 里合法，
 *   且与主机名无关 —— 主机名校验仍由证书自己的 SAN 决定，所以换 IP 要重签证书。
 *
 *   node mobile/scripts/android-pins.mjs --cert deploy/ssl/server.crt --dir mobile/native
 */
import fs from 'node:fs';
import path from 'node:path';
import { X509Certificate } from 'node:crypto';

export const RAW_NAME = 'hengbeger_server';
export const CERT_FILE = RAW_NAME + '.pem';
export const CONFIG_FILE = 'network_security_config.xml';
export const DEBUG_CONFIG_FILE = 'network_security_config.debug.xml';

function parseArgs(argv) {
  const options = { cert: 'deploy/ssl/server.crt', dir: 'mobile/native' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--cert') options.cert = argv[++i];
    else if (arg === '--dir') options.dir = argv[++i];
    else if (arg === '-h' || arg === '--help') options.help = true;
    else throw new Error('未知参数：' + arg);
  }
  return options;
}

export function securityConfigXml({ cleartext = false } = {}) {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<!-- 自签证书：整个 App 只信任 res/raw/' + CERT_FILE + ' 这一张证书，不信任任何公共 CA。',
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
    '      <certificates src="@raw/' + RAW_NAME + '" />',
    '    </trust-anchors>',
    '  </base-config>',
    '</network-security-config>',
    '',
  ].join('\n');
}

function writeIfChanged(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  if (existing === content) return { target, changed: false };
  fs.writeFileSync(target, content, 'utf8');
  return { target, changed: true };
}

export function generate({ cert, dir }) {
  const pem = fs.readFileSync(cert, 'utf8');
  const certificate = new X509Certificate(pem);
  const written = [
    writeIfChanged(path.join(dir, CERT_FILE), pem),
    writeIfChanged(path.join(dir, CONFIG_FILE), securityConfigXml({ cleartext: false })),
    writeIfChanged(path.join(dir, DEBUG_CONFIG_FILE), securityConfigXml({ cleartext: true })),
  ];
  return { certificate, written };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('android-pins.mjs')) {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('用法：node mobile/scripts/android-pins.mjs [--cert deploy/ssl/server.crt] [--dir mobile/native]');
    process.exit(0);
  }
  try {
    const { certificate, written } = generate(options);
    console.log('证书：' + path.resolve(options.cert));
    console.log('  subject：' + certificate.subject.replace(/\n/g, ', '));
    console.log('  有效期至：' + certificate.validTo);
    console.log('  SAN：' + String(certificate.subjectAltName || '(无)').replace(/\n/g, ', '));
    for (const file of written) {
      console.log((file.changed ? '已写入 ' : '已是最新 ') + path.relative(process.cwd(), file.target));
    }
  } catch (error) {
    console.error('[FAIL] ' + error.message);
    process.exit(1);
  }
}

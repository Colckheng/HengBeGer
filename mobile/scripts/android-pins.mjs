#!/usr/bin/env node
/**
 * 从自签证书算出 Android 证书固定（certificate pinning）需要的 SPKI SHA-256。
 *
 * Android 的 <pin-set> 固定的是「公钥」的哈希，不是证书指纹 —— 两者不一样，
 * 用证书指纹填进去会直接连不上。
 *
 *   node mobile/scripts/android-pins.mjs --cert deploy/ssl/server.crt
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { X509Certificate } from 'node:crypto';

function parseArgs(argv) {
  const options = { cert: 'deploy/ssl/server.crt', out: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--cert') options.cert = argv[++i];
    else if (arg === '--out') options.out = argv[++i];
    else if (arg === '-h' || arg === '--help') options.help = true;
    else throw new Error('未知参数：' + arg);
  }
  return options;
}

export function spkiPin(pem) {
  const cert = new X509Certificate(pem);
  const spki = cert.publicKey.export({ type: 'spki', format: 'der' });
  return 'sha256/' + createHash('sha256').update(spki).digest('base64');
}

export function pinSetXml(pin, { expiration = '2036-10-11' } = {}) {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<!-- 自签证书：整个 App 只信任这一把公钥，不信任任何公共 CA。',
    '     用 base-config 而不是 domain-config，是因为服务器地址是可配置的',
    '     （模拟器 10.0.2.2、局域网 IP、云服务器公网 IP 都可能填）。',
    '     证书换了以后必须重新生成（npm run mobile:pins），否则 App 直接连不上。 -->',
    '<network-security-config>',
    '  <base-config cleartextTrafficPermitted="false">',
    '    <trust-anchors>',
    '      <certificates src="system" />',
    '    </trust-anchors>',
    '    <pin-set expiration="' + expiration + '">',
    `      <pin digest="SHA-256">${pin.replace(/^sha256\//, '')}</pin>`,
    '    </pin-set>',
    '  </base-config>',
    '</network-security-config>',
    '',
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('android-pins.mjs')) {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('用法：node mobile/scripts/android-pins.mjs [--cert deploy/ssl/server.crt] [--out mobile/native/network_security_config.xml]');
    process.exit(0);
  }
  const pem = fs.readFileSync(options.cert, 'utf8');
  const pin = spkiPin(pem);
  console.log('证书：' + path.resolve(options.cert));
  console.log('SPKI pin：' + pin);
  if (options.out) {
    fs.mkdirSync(path.dirname(options.out), { recursive: true });
    fs.writeFileSync(options.out, pinSetXml(pin), 'utf8');
    console.log('已写入：' + options.out);
  }
}

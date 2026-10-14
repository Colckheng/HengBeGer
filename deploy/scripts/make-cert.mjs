#!/usr/bin/env node
// 生成自签证书（默认 10 年）。
//
//   node deploy/scripts/make-cert.mjs                         # CN/SAN = 127.0.0.1 + localhost
//   node deploy/scripts/make-cert.mjs --ip 47.98.1.2          # 云端：填 ECS 公网 IP
//   node deploy/scripts/make-cert.mjs --ip 47.98.1.2,192.168.1.9 --dns hengbeger.local --days 3650
//
// 传参提醒（Windows PowerShell 5.1 实测）：npm run cloud:cert -- --ip 1.2.3.4 里的裸 -- 会被
// PowerShell 吞掉，变成 npm run cloud:cert --ip 1.2.3.4，npm 再把 --ip 当自己的配置收走，
// 脚本一个参数都收不到，**默默签出一张只有 localhost 的证书**。两种可靠写法：
//   node deploy/scripts/make-cert.mjs --ip 1.2.3.4
//   npm run cloud:cert "--" "--ip" "1.2.3.4"      （把 -- 用引号包起来）
// 没收到 --ip/--dns 时脚本会打印醒目警告，防止「以为签了公网 IP，其实签了 localhost」。
//
// 为什么自签：大陆 + 无域名 => 80/443 不可用 => Let's Encrypt 的 ACME 校验走不了。
// App 端用证书固定（fingerprint）解决信任问题，见设计文档 §6。
//
// openssl 从哪来：
//   1. 本机 PATH 上有       -> 直接用
//   2. 没有（Windows 常见） -> 借 Docker：alpine + apk add openssl
//   注意别用 nginx:1.27-alpine，那个镜像里只有 libssl，没有 openssl 命令行。
//
// 产物：deploy/ssl/server.crt、deploy/ssl/server.key（已加进 .gitignore）

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEPLOY_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OPENSSL_IMAGE = process.env.OPENSSL_IMAGE || 'alpine:3.20';

function parseArgs(argv) {
  const out = { ips: [], dns: [], days: 3650, outDir: path.join(DEPLOY_DIR, 'ssl') };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(arg + ' 缺少取值');
      i += 1;
      return value;
    };
    if (arg === '--ip') out.ips.push(...next().split(',').map((s) => s.trim()).filter(Boolean));
    else if (arg === '--dns') out.dns.push(...next().split(',').map((s) => s.trim()).filter(Boolean));
    else if (arg === '--days') out.days = Number.parseInt(next(), 10);
    else if (arg === '--out') out.outDir = path.resolve(next());
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error('未知参数：' + arg);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log('用法：node deploy/scripts/make-cert.mjs [--ip <公网IP>[,<内网IP>]] [--dns <名字>] [--days 3650] [--out <目录>]');
  process.exit(0);
}

if (args.ips.length === 0 && args.dns.length === 0) {
  args.ips.push('127.0.0.1');
  args.dns.push('localhost');
  console.warn('[cert] 注意：没有收到 --ip / --dns，本次只签 127.0.0.1 + localhost 的自签证书。');
  console.warn('[cert] 如果是给云端的，请用：node deploy/scripts/make-cert.mjs --ip <ECS公网IP>');
  console.warn('[cert] 原因：PowerShell 5.1 会吞掉裸 --，npm run cloud:cert -- --ip 1.2.3.4 的参数到不了脚本。');
}
if (!Number.isFinite(args.days) || args.days < 1) throw new Error('--days 必须是正整数');

const cn = args.dns[0] || args.ips[0];
const sanEntries = [
  ...args.dns.map((d) => 'DNS:' + d),
  ...args.ips.map((ip) => 'IP:' + ip),
];

fs.mkdirSync(args.outDir, { recursive: true });
const crtPath = path.join(args.outDir, 'server.crt');
const keyPath = path.join(args.outDir, 'server.key');

const useLocal = (() => {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

// 容器里看到的路径是挂载点，本机跑就是本地路径
const certDir = useLocal ? args.outDir : '/certs';

if (useLocal) {
  console.log('[make-cert] 用本机 openssl');
} else {
  console.log('[make-cert] 本机没有 openssl，改用 ' + OPENSSL_IMAGE + ' + apk add openssl');
}
console.log('           CN = ' + cn);
console.log('           SAN = ' + sanEntries.join(', '));
console.log('           有效期 = ' + args.days + ' 天');

const genArgs = () => [
  'req', '-x509', '-nodes', '-newkey', 'rsa:2048',
  '-days', String(args.days),
  '-keyout', certDir + '/server.key',
  '-out', certDir + '/server.crt',
  '-subj', '/CN=' + cn,
  '-addext', 'subjectAltName=' + sanEntries.join(','),
  '-addext', 'basicConstraints=critical,CA:FALSE',
  '-addext', 'keyUsage=critical,digitalSignature,keyEncipherment',
  '-addext', 'extendedKeyUsage=serverAuth',
];

const inspectArgs = () => [
  ['x509', '-in', certDir + '/server.crt', '-noout', '-subject', '-dates'],
  ['x509', '-in', certDir + '/server.crt', '-noout', '-ext', 'subjectAltName'],
  ['x509', '-in', certDir + '/server.crt', '-noout', '-fingerprint', '-sha256'],
];

const quote = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";

/** 在容器里跑一条 sh 脚本：借挂载进来的目录 */
const runInContainer = (script) => execFileSync('docker', [
  'run', '--rm',
  '-v', args.outDir.replace(/\\/g, '/') + ':/certs',
  OPENSSL_IMAGE,
  'sh', '-c', 'set -e; apk add --no-cache openssl >/dev/null 2>&1; ' + script,
], { stdio: 'inherit' });

const runLocal = (argvList) => execFileSync('openssl', argvList, { stdio: 'inherit' });

try {
  if (useLocal) runLocal(genArgs());
  else runInContainer('openssl ' + genArgs().map(quote).join(' '));
} catch (error) {
  console.error('[make-cert] 生成失败：' + error.message);
  console.error('           要么把 openssl 装进 PATH，要么确认 Docker Desktop 在运行');
  process.exit(1);
}

if (!fs.existsSync(crtPath) || !fs.existsSync(keyPath)) {
  console.error('[make-cert] 命令跑完了但没看到产物：' + crtPath + ' / ' + keyPath);
  process.exit(1);
}
try {
  fs.chmodSync(keyPath, 0o600);
} catch {
  // Windows 上 chmod 基本无效，忽略
}

// 指纹是给人看的，取不到不算失败
try {
  if (useLocal) {
    for (const argvList of inspectArgs()) {
      runLocal(argvList);
      console.log('---');
    }
  } else {
    const script = inspectArgs().map((a) => 'openssl ' + a.map(quote).join(' ') + '; echo ---;').join(' ');
    runInContainer(script);
  }
} catch {
  // 忽略
}

console.log('[make-cert] 完成：' + crtPath);
console.log('            把上面那条 SHA256 Fingerprint 记下来，App 端证书固定要用它');

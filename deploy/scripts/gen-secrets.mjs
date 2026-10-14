#!/usr/bin/env node
// 生成 deploy/.env —— 云端与预演用的全部密钥。
//
//   node deploy/scripts/gen-secrets.mjs            # 生成；已存在则拒绝覆盖
//   node deploy/scripts/gen-secrets.mjs --force    # 覆盖重来（会让旧库密码失效）
//
// 纪律：密钥全部现场生成，不复用本机任何既有口令。
//
// 密码不能随便随机：src/utils/security.js 的 validatePasswordStrength 要求
// 长度 >= 8、含大写、含小写、含数字、含特殊字符，且 NODE_ENV=production 时
// 不满足就直接抛错（src/db/config.js:74）。所以这里按规则构造，而不是掷骰子。
// 另外刻意避开 $ ` " ' \ 这几个字符 —— 密码还要穿过 sh 和 .env 两层引号。

import { randomBytes, randomInt } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEPLOY_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = path.join(DEPLOY_DIR, '.env');

const force = process.argv.includes('--force');

// 去掉外形相近的字符，免得手抄密码时看错
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGIT = '23456789';
const SPECIAL = '!@#%^&*()-_=+';
const ALL = LOWER + UPPER + DIGIT + SPECIAL;

/** 构造一个必然通过 validatePasswordStrength 的密码 */
function strongPassword(length = 24) {
  const chars = [
    LOWER[randomInt(LOWER.length)],
    UPPER[randomInt(UPPER.length)],
    DIGIT[randomInt(DIGIT.length)],
    SPECIAL[randomInt(SPECIAL.length)],
    SPECIAL[randomInt(SPECIAL.length)],
  ];
  while (chars.length < length) chars.push(ALL[randomInt(ALL.length)]);
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

// base64url 只含 A-Za-z0-9-_，放进 .env 不用转义
const token = (bytes) => randomBytes(bytes).toString('base64url');

if (fs.existsSync(ENV_PATH) && !force) {
  console.error('[gen-secrets] 已存在：' + ENV_PATH);
  console.error('              想重新生成请加 --force（注意：旧数据库的密码会随之失效）');
  process.exit(1);
}

const values = {
  MYSQL_ROOT_PASSWORD: strongPassword(24),
  DB_PASSWORD: strongPassword(24),
  ADMIN_PASSWORD: strongPassword(20),
  AUTH_SECRET: token(48),
};

// 自检：规则要是哪天变了，这里先炸，别等到容器起来才发现
const checks = [
  [/.{8,}/, '长度至少 8 位'],
  [/[a-z]/, '含小写字母'],
  [/[A-Z]/, '含大写字母'],
  [/\d/, '含数字'],
  [/[!@#$%^&*(),.?":{}|<>]/, '含特殊字符'],
];
for (const key of ['MYSQL_ROOT_PASSWORD', 'DB_PASSWORD', 'ADMIN_PASSWORD']) {
  for (const [pattern, label] of checks) {
    if (!pattern.test(values[key])) {
      console.error('[gen-secrets] 自检失败：' + key + ' 不满足「' + label + '」');
      process.exit(1);
    }
  }
}

const template = `# HengBerGer 云端配置 —— 由 deploy/scripts/gen-secrets.mjs 于 ${new Date().toISOString()} 生成
# 不要提交这个文件（.gitignore 已覆盖）。键名含义见 deploy/.env.example。

# ---- 部署位置 ----
DATA_ROOT=./data
HTTPS_PORT=8443

# ---- MySQL ----
MYSQL_ROOT_PASSWORD=${values.MYSQL_ROOT_PASSWORD}
DB_NAME=hengbeger
DB_USER=hengbeger
DB_PASSWORD=${values.DB_PASSWORD}
MYSQL_BUFFER_POOL=256M

# ---- Node 应用 ----
ADMIN_PASSWORD=${values.ADMIN_PASSWORD}
AUTH_SECRET=${values.AUTH_SECRET}
LOG_LEVEL=info
SECURITY_SILENCE=false
TRUST_PROXY_HOPS=1
CORS_ORIGINS=
IMAGE_MODE=file
APP_TAG=latest

# ---- 预演覆盖层专用 ----
PREVIEW_DATA_ROOT=./data-preview
PREVIEW_HTTPS_PORT=8444
PREVIEW_MYSQL_PORT=3307

# ---- 时区 ----
TZ=Asia/Shanghai
`;

fs.writeFileSync(ENV_PATH, template, { mode: 0o600 });
try {
  fs.chmodSync(ENV_PATH, 0o600);
} catch {
  // Windows 上 chmod 基本无效，忽略
}

console.log('[gen-secrets] 已写入 ' + ENV_PATH);
console.log('              密钥不回显。要查看：Get-Content deploy/.env（或 cat）');
console.log('              下一步：npm run cloud:cert 生成自签证书，再 npm run cloud:preview:up');

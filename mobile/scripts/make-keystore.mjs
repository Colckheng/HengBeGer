#!/usr/bin/env node
/**
 * 生成正式包（release）用的签名 keystore。
 *
 *   node mobile/scripts/make-keystore.mjs            # 已存在就报错退出，不覆盖
 *   node mobile/scripts/make-keystore.mjs --force    # 覆盖重建（老包将无法覆盖升级！）
 *
 * 产出（两个都在 .gitignore 里，绝不进仓库）：
 *   mobile/hengbeger-release.keystore   私钥，丢了就再也发不出能覆盖升级的包
 *   mobile/keystore.properties          密码，被 android/app/build.gradle 读取
 *
 * 为什么必须自己签：expo prebuild 生成的 build.gradle 里 release 也用 debug 签名
 * （app/build.gradle:115 `signingConfig signingConfigs.debug`）。debug keystore 是
 * 每台机器各自生成的，换台机器出的包签名就不同，装上去只能先卸载 —— 「正式包」的意义
 * 就没了。签名补丁由 mobile/scripts/apply-android-patches.mjs 注入。
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const KEYSTORE_NAME = 'hengbeger-release.keystore';
export const PROPS_NAME = 'keystore.properties';
export const ALIAS = 'hengbeger';
export const VALIDITY_DAYS = 10000;

// 只用字母数字加 -_ ：properties 文件、shell、Gradle 三处都不需要转义。
const PASSWORD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function randomPassword(length = 32) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  return out;
}

// Android Studio 自带的 JBR 里有 keytool；PATH 上的优先。
export function findKeytool(env = process.env) {
  const candidates = [
    process.platform === 'win32' ? 'keytool.exe' : 'keytool',
    env.JAVA_HOME ? path.join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool') : null,
    'C:\\Program Files\\Android\\Android Studio\\jbr\\bin\\keytool.exe',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['-help'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // keytool -help 在没有参数时可能返回非 0，再试一次 --help 判定存在性
      try {
        execFileSync(candidate, ['--help'], { stdio: 'ignore' });
        return candidate;
      } catch (error) {
        if (error && error.code === 'ENOENT') continue;
        return candidate; // 存在但退出码非 0，能用
      }
    }
  }
  throw new Error('找不到 keytool：装 JDK 或把 JAVA_HOME 指向 Android Studio 的 jbr');
}

export function dname() {
  return 'CN=HengBerGer, OU=Mobile, O=HengBerGer, L=Beijing, ST=Beijing, C=CN';
}

export function generate({ dir, force = false, keytool = null, password = null } = {}) {
  const keystore = path.join(dir, KEYSTORE_NAME);
  const props = path.join(dir, PROPS_NAME);
  if (!force) {
    for (const file of [keystore, props]) {
      if (fs.existsSync(file)) {
        throw new Error('已存在 ' + file + '，不覆盖（真要重建加 --force，但老包将无法覆盖升级）');
      }
    }
  }
  const pw = password || randomPassword();
  const tool = keytool || findKeytool();
  fs.mkdirSync(dir, { recursive: true });
  execFileSync(tool, [
    '-genkeypair', '-v',
    '-keystore', keystore,
    '-storetype', 'PKCS12',
    '-alias', ALIAS,
    '-keyalg', 'RSA',
    '-keysize', '2048',
    '-validity', String(VALIDITY_DAYS),
    '-storepass', pw,
    '-keypass', pw,
    '-dname', dname(),
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  fs.writeFileSync(props, [
    '# 由 mobile/scripts/make-keystore.mjs 生成，不要提交（.gitignore:118-120）',
    '# storeFile 相对本文件所在目录（mobile/）解析',
    'storeFile=' + KEYSTORE_NAME,
    'storePassword=' + pw,
    'keyAlias=' + ALIAS,
    'keyPassword=' + pw,
    '',
  ].join('\n'), 'utf8');
  const details = describe({ keystore, storePassword: pw, keytool: tool });
  return { keystore, props, alias: ALIAS, password: pw, details };
}

// keytool -list -v 在中文 Windows 上打的是 GBK 中文标签，按标签取行不可靠。
// 只取 ASCII 的 "SHA256:" 一行 —— 这一行两种语言下都一样，也是后面跟 apksigner 对签名的依据。
// 有效期不去解析输出，直接用生成时的 VALIDITY_DAYS。
export function describe({ keystore, storePassword, keytool = null }) {
  const tool = keytool || findKeytool();
  const text = execFileSync(tool, [
    '-list', '-v', '-keystore', keystore, '-storepass', storePassword, '-alias', ALIAS,
  ], { encoding: 'utf8' });
  const line = text.split(/\r?\n/).find((l) => l.includes('SHA256:'));
  return { sha256: line ? line.slice(line.indexOf('SHA256:') + 'SHA256:'.length).trim() : '' };
}

const isCli = process.argv[1] && process.argv[1].endsWith('make-keystore.mjs');
if (isCli) {
  try {
    const dir = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'mobile');
    const force = process.argv.includes('--force');
    const result = generate({ dir, force });
    console.log('已生成 ' + result.keystore);
    console.log('已生成 ' + result.props);
    console.log('  alias    ' + result.alias);
    console.log('  有效期   ' + VALIDITY_DAYS + ' 天');
    console.log('  SHA256   ' + (result.details.sha256 || '(读取失败)'));
    console.log('');
    console.log('！！ 立刻把这两个文件备份到仓库之外（密码管理器 / 加密盘）：');
    console.log('   私钥丢了，以后出的包签名不同，必须卸载重装才能升级。');
    console.log('   这两个文件已被 .gitignore 排除，不会进版本库。');
  } catch (error) {
    console.error('[FAIL] ' + error.message);
    process.exit(1);
  }
}

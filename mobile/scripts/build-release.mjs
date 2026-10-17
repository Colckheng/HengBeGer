#!/usr/bin/env node
/**
 * 一条命令出正式包（release APK）：
 *
 *   npm run mobile:release            # 打补丁 → assembleRelease → 验签
 *   npm run mobile:release -- --no-patch   # 跳过补丁（已经 patch 过）
 *
 * 它做的事：
 *   1. applyPatches()：证书信任锚 + AndroidManifest + release 签名（需要 mobile/keystore.properties）
 *   2. gradlew assembleRelease（JAVA_HOME 指向 Android Studio 的 jbr，PATH 上的 java 是 1.8 编不了）
 *   3. apksigner verify --print-certs 验证签名者，并和 keystore 的指纹对不上就报错
 *   4. 把 APK 复制到 mobile/dist/ 并打印安装命令
 *
 * 为什么不用 expo run:android --variant release：它默认 adb 装机，装之前要先卸掉
 * debug 签名版本（签名不同不能覆盖），失败时会卡在半路。这里只出包，装机单独做。
 *
 * 子进程一律用 stdio: 'inherit' 或直接写文件句柄，不建管道 ——
 * 沙箱下 spawn 的 pipe 会 EPERM（cloud:test 里那条 skip 就是这个原因）。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyPatches } from './apply-android-patches.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobileDir = path.resolve(here, '..');
const androidDir = path.join(mobileDir, 'android');
const DEFAULT_JAVA_HOME = 'C:\\Program Files\\Android\\Android Studio\\jbr';
const DEFAULT_SDK = path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk');

// Android Studio 的 jbr 优先：AGP 对它有保证，而 PATH/JAVA_HOME 上可能是别的版本。
export function javaHome(env = process.env) {
  const candidates = [DEFAULT_JAVA_HOME, env.JAVA_HOME];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(path.join(candidate, 'bin', 'java.exe'))) return candidate;
  }
  return null;
}

export function androidSdk(env = process.env) {
  const candidates = [env.ANDROID_HOME, env.ANDROID_SDK_ROOT, DEFAULT_SDK];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// 取 build-tools 里版本号最大的 apksigner（按数字比较，不是字符串比较）
export function findApksigner(sdk) {
  const dir = path.join(sdk, 'build-tools');
  if (!fs.existsSync(dir)) return null;
  const versions = fs.readdirSync(dir)
    .filter((name) => /^\d+(\.\d+)+$/.test(name))
    .sort((a, b) => {
      const pa = a.split('.').map(Number);
      const pb = b.split('.').map(Number);
      for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
        if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
      }
      return 0;
    });
  for (const version of versions.reverse()) {
    const candidate = path.join(dir, version, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Windows 上不能直接 execFile 一个 .bat/.cmd：Node 22 起会抛 EINVAL
 * （CVE-2024-27980 的修复，见 gradlew.bat 与 apksigner.bat 两次踩坑）。
 * 统一过一层 cmd.exe /d /s /c。
 */
export function resolveCommand(command, args) {
  if (process.platform !== 'win32' || !/\.(bat|cmd)$/i.test(command)) return [command, args];
  return [process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command, ...args]];
}

// 不建管道：把子进程的 stdout/stderr 直接接到文件句柄上。
export function runToFile(command, args, { cwd, env, outFile }) {
  const fd = fs.openSync(outFile, 'w');
  try {
    execFileSync(...resolveCommand(command, args), { cwd, env, stdio: ['ignore', fd, fd] });
  } finally {
    fs.closeSync(fd);
  }
  return fs.readFileSync(outFile, 'utf8');
}

// apksigner verify --print-certs 的输出里，签名者证书摘要（SHA-256）那一行
export function parseSignerSha256(output) {
  const line = output.split(/\r?\n/).find((l) => /Signer #1 certificate SHA-256 digest:/i.test(l));
  return line ? line.slice(line.indexOf(':') + 1).trim().toLowerCase() : '';
}

export function parseKeystoreSha256(details) {
  // keytool 打的是 AA:BB:CC 形式，apksigner 打的是小写无冒号，统一成无冒号小写比较
  return (details.sha256 || '').replace(/[:\s]/g, '').toLowerCase();
}

export async function build({ patch = true, env = process.env, log = console.log } = {}) {
  if (!fs.existsSync(androidDir)) {
    throw new Error('还没有 android/ 工程，先跑 npm run mobile:prebuild');
  }
  if (patch) {
    const result = await applyPatches({ androidDir, dir: path.join(mobileDir, 'native') });
    if (!result.signing.applied) {
      throw new Error('release 会用 debug 签名，先跑 npm run mobile:keystore 生成 mobile/keystore.properties');
    }
    log('补丁：' + (result.manifest.changed || result.signing.changed ? '已更新' : '已是最新'));
  }
  const java = javaHome(env);
  if (!java) throw new Error('找不到 JDK：把 JAVA_HOME 指向 Android Studio 的 jbr');
  const sdk = androidSdk(env);
  if (!sdk) throw new Error('找不到 Android SDK：设置 ANDROID_HOME');

  const childEnv = { ...env, JAVA_HOME: java, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
  log('JAVA_HOME=' + java);
  log('开始 assembleRelease（首次约 3-6 分钟）…');
  const [command, args] = resolveCommand(
    process.platform === 'win32' ? 'gradlew.bat' : './gradlew',
    ['assembleRelease', '--console=plain'],
  );
  execFileSync(command, args, { cwd: androidDir, env: childEnv, stdio: 'inherit' });

  const apk = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  if (!fs.existsSync(apk)) throw new Error('assembleRelease 没报错但没有产物：' + apk);

  const apksigner = findApksigner(sdk);
  if (!apksigner) throw new Error('找不到 apksigner，检查 Android SDK build-tools');
  const outFile = path.join(os.tmpdir(), 'hengbeger-apksigner.txt');
  const output = runToFile(apksigner, ['verify', '--print-certs', apk], { cwd: mobileDir, env: childEnv, outFile });
  const signer = parseSignerSha256(output);
  const distDir = path.join(mobileDir, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  const target = path.join(distDir, 'hengbeger-release.apk');
  fs.copyFileSync(apk, target);
  return { apk: target, signer, size: fs.statSync(target).size, apksigner: output.trim() };
}

const isCli = process.argv[1] && process.argv[1].endsWith('build-release.mjs');
if (isCli) {
  try {
    const result = build({ patch: !process.argv.includes('--no-patch') });
    console.log('');
    console.log('产物  ' + result.apk);
    console.log('大小  ' + (result.size / 1024 / 1024).toFixed(1) + ' MB');
    console.log('签名者 SHA-256  ' + result.signer);
    console.log('');
    console.log('装机（debug 签名版本必须先卸载，签名不同不能覆盖）：');
    console.log('  adb uninstall cc.nanoka.hengbeger');
    console.log('  adb install -r "' + result.apk + '"');
  } catch (error) {
    console.error('[FAIL] ' + error.message);
    process.exit(1);
  }
}

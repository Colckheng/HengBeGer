#!/usr/bin/env node
/**
 * prebuild 之后要打的补丁（Expo 没有现成的配置项）：
 *   1. native/hengbeger_server.pem              → android/app/src/main/res/raw/
 *   2. native/network_security_config.xml       → android/app/src/main/res/xml/（release）
 *   3. native/network_security_config.debug.xml → android/app/src/debug/res/xml/（debug 变体覆盖 main）
 *                                                以及 android/app/src/debugOptimized/res/xml/
 *                                                （RN gradle plugin 会 maybeCreate("debugOptimized")，
 *                                                  它只继承 debug 的配置不继承 debug 的 sourceSet，
 *                                                  漏掉这个变体就加载不了 Metro）
 *   4. AndroidManifest.xml 的 <application> 加 android:networkSecurityConfig="@xml/network_security_config"
 *
 * 必须放在 prebuild 之后：prebuild 会重新生成 android/ 目录，手改的东西会被覆盖。
 *
 *   node mobile/scripts/apply-android-patches.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

export const MANIFEST_ATTR = 'android:networkSecurityConfig="@xml/network_security_config"';
const RAW_NAME = 'hengbeger_server';

export function copyIfChanged(src, target) {
  const content = fs.readFileSync(src);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const existing = fs.existsSync(target) ? fs.readFileSync(target) : null;
  if (existing && existing.equals(content)) return { src, target, changed: false };
  fs.writeFileSync(target, content);
  return { src, target, changed: true };
}

export function patchManifest(androidDir) {
  const manifest = path.join(androidDir, 'app', 'src', 'main', 'AndroidManifest.xml');
  if (!fs.existsSync(manifest)) throw new Error('找不到 AndroidManifest.xml：' + manifest);
  const original = fs.readFileSync(manifest, 'utf8');
  if (original.includes(MANIFEST_ATTR)) return { manifest, changed: false };
  const openTag = original.match(/<application\b[^>]*>/);
  if (!openTag) throw new Error('AndroidManifest.xml 里没有 <application> 标签');
  const patched = original.replace(openTag[0], openTag[0].replace(/\s*>$/, '\n        ' + MANIFEST_ATTR + '>'));
  fs.writeFileSync(manifest, patched, 'utf8');
  return { manifest, changed: true };
}

export function applyPatches({ androidDir = path.resolve('android'), dir = path.resolve('native') } = {}) {
  if (!fs.existsSync(androidDir)) {
    throw new Error('还没有 android/ 工程，先跑 npm run mobile:prebuild');
  }
  const debugXml = path.join(dir, 'network_security_config.debug.xml');
  const sources = [
    [path.join(dir, 'network_security_config.xml'), path.join(androidDir, 'app', 'src', 'main', 'res', 'xml', 'network_security_config.xml')],
    [debugXml, path.join(androidDir, 'app', 'src', 'debug', 'res', 'xml', 'network_security_config.xml')],
    [debugXml, path.join(androidDir, 'app', 'src', 'debugOptimized', 'res', 'xml', 'network_security_config.xml')],
    [path.join(dir, RAW_NAME + '.pem'), path.join(androidDir, 'app', 'src', 'main', 'res', 'raw', RAW_NAME + '.pem')],
  ];
  for (const [src] of sources) {
    if (!fs.existsSync(src)) {
      throw new Error('缺少证书固定文件，先跑 npm run mobile:pins：' + src);
    }
  }
  const files = sources.map(([src, target]) => copyIfChanged(src, target));
  const manifest = patchManifest(androidDir);
  return { files, manifest };
}

const isCli = process.argv[1] && process.argv[1].endsWith('apply-android-patches.mjs');
if (isCli) {
  try {
    const result = applyPatches();
    for (const file of result.files) {
      console.log((file.changed ? '已写入 ' : '已是最新 ') + file.target);
    }
    console.log((result.manifest.changed ? '已打补丁 ' : '已是最新 ') + result.manifest.manifest);
  } catch (error) {
    console.error('[FAIL] ' + error.message);
    process.exit(1);
  }
}

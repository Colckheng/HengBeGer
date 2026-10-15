#!/usr/bin/env node
/**
 * prebuild 之后要打的补丁（Expo 没有现成的配置项）：
 *   1. native/*.pem（信任锚，可多张）           → android/app/src/main/res/raw/
 *   2. native/network_security_config.xml       → android/app/src/main/res/xml/（release）
 *   3. native/network_security_config.debug.xml → android/app/src/debug/res/xml/（debug 变体覆盖 main）
 *                                                以及 android/app/src/debugOptimized/res/xml/
 *                                                （RN gradle plugin 会 maybeCreate("debugOptimized")，
 *                                                  它只继承 debug 的配置不继承 debug 的 sourceSet，
 *                                                  漏掉这个变体就加载不了 Metro）
 *   4. AndroidManifest.xml 的 <application> 加 android:networkSecurityConfig="@xml/network_security_config"
 *   5. app/build.gradle 的 release 签名从 debug keystore 换成 mobile/keystore.properties
 *      （expo prebuild 生成的 release 也是 signingConfigs.debug，见 build.gradle:115）
 *   6. app/build.gradle 的 defaultConfig 里加 -DCMAKE_OBJECT_PATH_MAX=270
 *      （否则 release 构建在 Windows 上会被 ninja 的 260 字符路径限制打死，见下方说明）
 *
 * 必须放在 prebuild 之后：prebuild 会重新生成 android/ 目录，手改的东西会被覆盖。
 *
 *   node mobile/scripts/apply-android-patches.mjs
 *
 * 第 5 步只在 mobile/keystore.properties 存在时生效（先跑 npm run mobile:keystore）。
 * 没有它也能出包，但 release 会用 debug 签名 —— 换台机器签名就变，装不上去只能卸载重装。
 */
import fs from 'node:fs';
import path from 'node:path';

export const MANIFEST_ATTR = 'android:networkSecurityConfig="@xml/network_security_config"';

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

/**
 * 为什么需要 CMAKE_OBJECT_PATH_MAX：
 *   ninja（SDK 里 cmake 3.22.1/3.30.5 自带的是同一个 1.10.2）在 Windows 上对
 *   build.ninja 里的相对路径做 260 字符检查，超了直接
 *   "ninja: error: Stat(<path>): Filename longer than 260 characters"。
 *   CMake 本来会把过长的对象名换成 md5 前缀（CreateSafeUniqueObjectFileName），
 *   但它用的上限是 CMAKE_OBJECT_PATH_MAX（Windows 默认 250），而判定
 *   "能不能缩" 的条件（cmLocalGeneratorCheckObjectName / ShortenObjectName）在临界点上
 *   会 find('/') 返回 npos 从而放弃缩短 —— armeabi-v7a 恰好就差 1 个字符，
 *   于是保留 180 字符长名 → 相对路径 276 > 260 → release 构建失败（debug 能过，
 *   因为 Debug/<hash> 比 RelWithDebInfo/<hash> 短 9 个字符）。
 *
 *   安全窗口：调大 M 会让缩短起点前移，M ≥ dir_len + 文件名长 + 33 才能稳定缩短；
 *   但 M 太大又会缩到更浅的目录反而变长（缩短后相对路径 ≤ 前缀 + M - dir_len）。
 *   本工程 dir_len ≈ 178、前缀 ≈ 96，窗口约 251 ≤ M ≤ 342；取 270 两边都留余量。
 */
export const CMAKE_OBJECT_PATH_MAX = 270;

export const RELEASE_SIGNING_LINE = 'signingConfig signingConfigs.release';
const DEBUG_SIGNING_LINE = 'signingConfig signingConfigs.debug';

// 读 keystore.properties 的 Gradle 代码，插在 android { } 之前。
// rootProject 是 mobile/android/，keystore 与 keystore.properties 都在 mobile/ 下，
// 所以路径统一从 keystoreDir（= mobile/）解析。
const KEYSTORE_PRELUDE = [
  'def keystoreDir = rootProject.file("..")',
  'def keystorePropertiesFile = new java.io.File(keystoreDir, "keystore.properties")',
  'def keystoreProperties = new java.util.Properties()',
  'if (keystorePropertiesFile.exists()) {',
  '    keystorePropertiesFile.withInputStream { keystoreProperties.load(it) }',
  '}',
  '',
].join('\n');

const RELEASE_SIGNING_BLOCK = [
  '        release {',
  "            storeFile new java.io.File(keystoreDir, keystoreProperties['storeFile'])",
  "            storePassword keystoreProperties['storePassword']",
  "            keyAlias keystoreProperties['keyAlias']",
  "            keyPassword keystoreProperties['keyPassword']",
  '        }',
].join('\n');

/**
 * 把 release 变体从 debug 签名改成 keystore.properties 里的正式签名。
 * 没有 keystore.properties 时原样返回（changed:false, applied:false），不报错 ——
 * 只想跑 debug 包的人不该被 keystore 卡住。
 */
export function patchGradle(androidDir) {
  const gradle = path.join(androidDir, 'app', 'build.gradle');
  if (!fs.existsSync(gradle)) throw new Error('找不到 build.gradle：' + gradle);
  const props = path.join(path.dirname(androidDir), 'keystore.properties');
  const original = fs.readFileSync(gradle, 'utf8');
  if (!fs.existsSync(props)) return { gradle, props, changed: false, applied: false };
  if (original.includes(RELEASE_SIGNING_LINE)) return { gradle, props, changed: false, applied: true };

  let patched = original;
  // 1. android { 之前插入 properties 读取
  if (!patched.includes('keystorePropertiesFile')) {
    const androidIndex = patched.indexOf('\nandroid {');
    if (androidIndex === -1) throw new Error('build.gradle 里找不到 android { 块');
    patched = patched.slice(0, androidIndex + 1) + KEYSTORE_PRELUDE + patched.slice(androidIndex + 1);
  }
  // 2. signingConfigs 里补 release 块（跟在 debug 块之后）
  const signingIndex = patched.indexOf('signingConfigs {');
  if (signingIndex === -1) throw new Error('build.gradle 里找不到 signingConfigs 块');
  const signingEnd = patched.indexOf('\n    }', signingIndex);
  if (signingEnd === -1) throw new Error('signingConfigs 块没有正常结束');
  patched = patched.slice(0, signingEnd) + '\n' + RELEASE_SIGNING_BLOCK + patched.slice(signingEnd);
  // 3. release 变体改指 signingConfigs.release
  //    buildTypes 里 debug 在前 release 在后，所以从 'release {' 之后再找第一条 debug 签名行。
  const buildTypesIndex = patched.indexOf('buildTypes {');
  if (buildTypesIndex === -1) throw new Error('build.gradle 里找不到 buildTypes 块');
  const releaseIndex = patched.indexOf('release {', buildTypesIndex);
  if (releaseIndex === -1) throw new Error('buildTypes 里找不到 release 变体');
  const target = patched.indexOf(DEBUG_SIGNING_LINE, releaseIndex);
  if (target === -1) throw new Error('release 变体里找不到 signingConfig signingConfigs.debug');
  patched = patched.slice(0, target) + RELEASE_SIGNING_LINE + patched.slice(target + DEBUG_SIGNING_LINE.length);

  fs.writeFileSync(gradle, patched, 'utf8');
  return { gradle, props, changed: true, applied: true };
}

const CMAKE_ARGS_BLOCK = [
  '        externalNativeBuild {',
  '            cmake {',
  '                arguments "-DCMAKE_OBJECT_PATH_MAX=' + CMAKE_OBJECT_PATH_MAX + '"',
  '            }',
  '        }',
].join('\n');

/**
 * 在 defaultConfig 里注入 CMake 参数。RN 的 NdkConfiguratorUtils.kt:39-45 是
 * "追加式" 的（用户给的 arguments 保留，缺的默认值才补），所以这里加一项不会
 * 覆盖它自己补的 PROJECT_BUILD_DIR / REACT_ANDROID_DIR 等。
 */
export function patchCmakeArgs(androidDir) {
  const gradle = path.join(androidDir, 'app', 'build.gradle');
  if (!fs.existsSync(gradle)) throw new Error('找不到 build.gradle：' + gradle);
  const original = fs.readFileSync(gradle, 'utf8');
  if (original.includes('CMAKE_OBJECT_PATH_MAX')) return { gradle, changed: false };
  const marker = 'defaultConfig {';
  const index = original.indexOf(marker);
  if (index === -1) throw new Error('build.gradle 里找不到 defaultConfig 块');
  if (original.includes('externalNativeBuild')) {
    throw new Error('build.gradle 里已经有 externalNativeBuild 块，请手工确认 CMAKE_OBJECT_PATH_MAX 已设置');
  }
  const insertAt = index + marker.length;
  const patched = original.slice(0, insertAt) + '\n' + CMAKE_ARGS_BLOCK + original.slice(insertAt);
  fs.writeFileSync(gradle, patched, 'utf8');
  return { gradle, changed: true };
}

export function applyPatches({ androidDir = path.resolve('android'), dir = path.resolve('native') } = {}) {
  if (!fs.existsSync(androidDir)) {
    throw new Error('还没有 android/ 工程，先跑 npm run mobile:prebuild');
  }
  const debugXml = path.join(dir, 'network_security_config.debug.xml');
  // 信任锚按证书列，可以有多张（云端 ECS + 本机预演栈），文件名即 res/raw 资源名。
  const anchors = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((name) => name.endsWith('.pem')).sort()
    : [];
  const rawDir = path.join(androidDir, 'app', 'src', 'main', 'res', 'raw');
  const sources = [
    [path.join(dir, 'network_security_config.xml'), path.join(androidDir, 'app', 'src', 'main', 'res', 'xml', 'network_security_config.xml')],
    [debugXml, path.join(androidDir, 'app', 'src', 'debug', 'res', 'xml', 'network_security_config.xml')],
    [debugXml, path.join(androidDir, 'app', 'src', 'debugOptimized', 'res', 'xml', 'network_security_config.xml')],
    ...anchors.map((name) => [path.join(dir, name), path.join(rawDir, name)]),
  ];
  for (const [src] of sources) {
    if (!fs.existsSync(src)) {
      throw new Error('缺少证书固定文件，先跑 npm run mobile:pins：' + src);
    }
  }
  if (anchors.length === 0) {
    throw new Error('缺少证书固定文件，先跑 npm run mobile:pins：' + dir + ' 里没有 .pem');
  }
  const files = sources.map(([src, target]) => copyIfChanged(src, target));
  // 上一版只拷 hengbeger_server.pem；换证书后 res/raw 里的旧锚会被 aapt2 一起打进包，
  // 虽然没人引用但会让「包里到底信任谁」难以判断，这里清掉。
  const removed = [];
  if (fs.existsSync(rawDir)) {
    for (const name of fs.readdirSync(rawDir)) {
      if (!name.endsWith('.pem') || anchors.includes(name)) continue;
      fs.rmSync(path.join(rawDir, name));
      removed.push(path.join(rawDir, name));
    }
  }
  const manifest = patchManifest(androidDir);
  const cmake = patchCmakeArgs(androidDir);
  const signing = patchGradle(androidDir);
  return { files, removed, manifest, cmake, signing };
}

const isCli = process.argv[1] && process.argv[1].endsWith('apply-android-patches.mjs');
if (isCli) {
  try {
    const result = applyPatches();
    for (const file of result.files) {
      console.log((file.changed ? '已写入 ' : '已是最新 ') + file.target);
    }
    for (const target of result.removed) {
      console.log('已删除（不再需要的信任锚） ' + target);
    }
    console.log((result.manifest.changed ? '已打补丁 ' : '已是最新 ') + result.manifest.manifest);
    console.log((result.cmake.changed ? '已打补丁 ' : '已是最新 ') + result.cmake.gradle + '（CMAKE_OBJECT_PATH_MAX=' + CMAKE_OBJECT_PATH_MAX + '）');
    if (result.signing.applied) {
      console.log((result.signing.changed ? '已打补丁 ' : '已是最新 ') + result.signing.gradle);
    } else {
      console.log('未改签名 ' + result.signing.gradle + '（没有 ' + result.signing.props + '，release 会用 debug 签名）');
    }
  } catch (error) {
    console.error('[FAIL] ' + error.message);
    process.exit(1);
  }
}

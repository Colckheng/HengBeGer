import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ALIAS, KEYSTORE_NAME, PROPS_NAME, randomPassword } from '../scripts/make-keystore.mjs';
import { CMAKE_OBJECT_PATH_MAX, applyPatches, patchCmakeArgs, patchGradle } from '../scripts/apply-android-patches.mjs';
import { findApksigner, parseKeystoreSha256, parseSignerSha256 } from '../scripts/build-release.mjs';

// 回归测试：expo prebuild 生成的 build.gradle 里 release 也用 debug 签名
// （app/build.gradle:115），照它出的「正式包」换台机器就装不上（签名不同不能覆盖升级）。
// 这里验证补丁脚本把 release 接到 keystore.properties 上，且幂等、缺 properties 时不报错。

const here = path.dirname(fileURLToPath(import.meta.url));
const mobileDir = path.resolve(here, '..');

// 和 expo prebuild 生成的结构一致的最小工程（prebuild 会重新生成 android/，
// 所以补丁必须能吃下这个形状；真工程的 build.gradle 只在本地存在，CI 上跑不到）。
function fixtureGradle() {
  return [
    "apply plugin: 'com.android.application'",
    '',
    'android {',
    '    namespace "cc.nanoka.hengbeger"',
    '    defaultConfig {',
    "        applicationId 'cc.nanoka.hengbeger'",
    '        minSdkVersion 24',
    '        versionCode 1',
    '    }',
    '    signingConfigs {',
    '        debug {',
    "            storeFile file('debug.keystore')",
    "            storePassword 'android'",
    "            keyAlias 'androiddebugkey'",
    "            keyPassword 'android'",
    '        }',
    '    }',
    '    buildTypes {',
    '        debug {',
    '            signingConfig signingConfigs.debug',
    '        }',
    '        release {',
    '            signingConfig signingConfigs.debug',
    '            minifyEnabled false',
    '        }',
    '    }',
    '}',
    '',
  ].join('\n');
}

function makeFixture({ withProps = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hengbeger-release-'));
  const androidDir = path.join(root, 'android');
  fs.mkdirSync(path.join(androidDir, 'app'), { recursive: true });
  fs.writeFileSync(path.join(androidDir, 'app', 'build.gradle'), fixtureGradle(), 'utf8');
  if (withProps) {
    fs.writeFileSync(path.join(root, PROPS_NAME), [
      'storeFile=' + KEYSTORE_NAME,
      'storePassword=test-password',
      'keyAlias=' + ALIAS,
      'keyPassword=test-password',
      '',
    ].join('\n'), 'utf8');
  }
  return { root, androidDir, gradle: path.join(androidDir, 'app', 'build.gradle') };
}

test('release 签名：没有 keystore.properties 时不动 build.gradle', () => {
  const { androidDir, gradle } = makeFixture({ withProps: false });
  const before = fs.readFileSync(gradle, 'utf8');
  const result = patchGradle(androidDir);
  assert.equal(result.applied, false);
  assert.equal(result.changed, false);
  assert.equal(fs.readFileSync(gradle, 'utf8'), before, '缺 properties 时不该改文件');
});

test('release 签名：把 release 接到 keystore.properties，且幂等', () => {
  const { androidDir, gradle } = makeFixture();
  const first = patchGradle(androidDir);
  assert.equal(first.applied, true);
  assert.equal(first.changed, true);
  const text = fs.readFileSync(gradle, 'utf8');
  assert.match(text, /signingConfig signingConfigs\.release/, 'release 没接上正式签名');
  assert.match(text, /release \{/, 'signingConfigs 里没有 release 块');
  assert.match(text, /keystoreProperties\['storePassword'\]/, '没有从 properties 读密码');
  assert.match(text, /rootProject\.file\("\.\."\)/, 'keystore 目录没指向 mobile/');
  // debug 变体必须还是 debug 签名，别把 debug 包也改了
  assert.match(text, /debug \{\n\s+signingConfig signingConfigs\.debug/);

  const second = patchGradle(androidDir);
  assert.equal(second.changed, false, '第二次跑应该幂等');
  assert.equal(fs.readFileSync(gradle, 'utf8'), text);
});

// ninja 在 Windows 上对 build.ninja 里的相对路径做 260 字符检查，超了直接报
// "ninja: error: Stat(<path>): Filename longer than 260 characters"。
// CMake 只在对象名相对 CMAKE_OBJECT_PATH_MAX 太长时才做 md5 缩短，
// 而默认值 250 恰好让 armeabi-v7a 卡在临界点（debug 能过、release 不能）。
test('长路径：defaultConfig 里注入 CMAKE_OBJECT_PATH_MAX，且幂等', () => {
  const { androidDir, gradle } = makeFixture();
  const first = patchCmakeArgs(androidDir);
  assert.equal(first.changed, true);
  const text = fs.readFileSync(gradle, 'utf8');
  assert.match(text, /externalNativeBuild \{\s*\n\s*cmake \{\s*\n\s*arguments "-DCMAKE_OBJECT_PATH_MAX=\d+"/, '没有注入 CMake 参数');
  assert.match(text, new RegExp('-DCMAKE_OBJECT_PATH_MAX=' + CMAKE_OBJECT_PATH_MAX));
  // 必须落在 defaultConfig 里：RN 的 NdkConfiguratorUtils.kt:39-45 读的是
  // ext.defaultConfig.externalNativeBuild.cmake.arguments
  const dc = text.indexOf('defaultConfig {');
  const eb = text.indexOf('externalNativeBuild {');
  assert.ok(dc !== -1 && eb > dc && eb < text.indexOf("applicationId"), 'externalNativeBuild 不在 defaultConfig 里');
  assert.equal(patchCmakeArgs(androidDir).changed, false, '第二次跑应该幂等');
  assert.equal(fs.readFileSync(gradle, 'utf8'), text);
});

test('长路径：取值落在能稳定缩短又不反向变长的窗口内', () => {
  // 窗口由 CMake 的 CreateSafeUniqueObjectFileName/ShortenObjectName 推导：
  // 调大 M 会让缩短起点前移；太小则 find('/') 返回 npos 放弃缩短（保留 180 长名 → 276 超限），
  // 太大又会缩到更浅的目录反而变长。实测窗口约 251..342。
  assert.ok(CMAKE_OBJECT_PATH_MAX >= 251 && CMAKE_OBJECT_PATH_MAX <= 342,
    'CMAKE_OBJECT_PATH_MAX=' + CMAKE_OBJECT_PATH_MAX + ' 不在安全窗口内');
});

test('长路径：已有 externalNativeBuild 时不乱改，明确报错', () => {
  const { androidDir, gradle } = makeFixture();
  fs.writeFileSync(gradle, fs.readFileSync(gradle, 'utf8').replace(
    "        applicationId 'cc.nanoka.hengbeger'",
    '        externalNativeBuild {\n            cmake {\n                path "CMakeLists.txt"\n            }\n        }\n        applicationId \'cc.nanoka.hengbeger\''), 'utf8');
  assert.throws(() => patchCmakeArgs(androidDir), /已经有 externalNativeBuild 块/);
});

test('release 签名：keystore.properties 不进版本库', () => {
  const ignore = fs.readFileSync(path.resolve(mobileDir, '..', '.gitignore'), 'utf8');
  assert.match(ignore, /^mobile\/keystore\.properties$/m, '.gitignore 没有排除 keystore.properties');
  assert.match(ignore, /^mobile\/\*\.keystore$/m, '.gitignore 没有排除 *.keystore');
  for (const name of [KEYSTORE_NAME, PROPS_NAME]) {
    assert.ok(!fs.existsSync(path.resolve(mobileDir, '..', name)), name + ' 不该出现在仓库根');
  }
});

test('release 签名：真工程的 build.gradle 已打上补丁（没 prebuild 就跳过）', () => {
  const gradle = path.resolve(mobileDir, 'android', 'app', 'build.gradle');
  if (!fs.existsSync(gradle)) return;
  const text = fs.readFileSync(gradle, 'utf8');
  assert.match(text, /signingConfig signingConfigs\.release/);
  assert.match(text, /-DCMAKE_OBJECT_PATH_MAX=\d+/, '真工程没注入 CMAKE_OBJECT_PATH_MAX，release 构建会挂在 260 字符路径上');
  // 补丁必须在 prebuild 之后重跑：源码里唯一一处 debug 签名应只剩 debug 变体那一行
  const debugLines = text.split(/\r?\n/).filter((l) => l.includes('signingConfig signingConfigs.debug'));
  assert.equal(debugLines.length, 1, 'release 变体还是 debug 签名，重跑 npm run mobile:patch');
});

test('release 签名：applyPatches 会在没有 properties 时明确报错', async () => {
  const { androidDir } = makeFixture({ withProps: false });
  // native/ 里没有证书文件时应该先报证书的错，这里直接确认它能抛错而不是静默通过。
  // applyPatches 是 async 的（要调 patchIcons 生成图标），所以用 rejects 而不是 throws。
  await assert.rejects(() => applyPatches({ androidDir, dir: path.resolve(mobileDir, 'native', 'not-exists') }), /缺少证书固定文件/);
});

test('release 签名：密码只用 properties/shell 里安全的字符', () => {
  const pw = randomPassword(32);
  assert.equal(pw.length, 32);
  assert.match(pw, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(randomPassword(32), pw, '两次生成不该相同');
});

test('release 签名：apksigner 与 keytool 的指纹能对齐比较', () => {
  // apksigner 输出小写无冒号，keytool 输出大写带冒号，比较前必须归一化
  const apksignerOut = [
    'Verifies',
    'Signer #1 certificate DN: CN=HengBerGer',
    'Signer #1 certificate SHA-256 digest: 4471086e31ed97b12acea55e23a218bf60711f2214f86344bfb7cd161e49e824',
    'Signer #1 certificate SHA-1 digest: aa:bb',
  ].join('\n');
  assert.equal(parseSignerSha256(apksignerOut), '4471086e31ed97b12acea55e23a218bf60711f2214f86344bfb7cd161e49e824');
  assert.equal(parseKeystoreSha256({ sha256: '44:71:08:6E:31:ED:97:B1:2A:CE:A5:5E:23:A2:18:BF:60:71:1F:22:14:F8:63:44:BF:B7:CD:16:1E:49:E8:24' }),
    parseSignerSha256(apksignerOut));
  assert.equal(parseSignerSha256('Verifies\n'), '');
});

test('release 签名：能找到 apksigner（没装 SDK 就跳过）', () => {
  const sdk = process.env.ANDROID_HOME || path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk');
  if (!fs.existsSync(path.join(sdk, 'build-tools'))) return;
  const apksigner = findApksigner(sdk);
  assert.ok(apksigner, 'SDK 里找不到 apksigner');
  assert.ok(fs.existsSync(apksigner));
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { CLOUD_CERT, PREVIEW_CERT, REPO_ROOT, planAnchors, rawNameFor, securityConfigXml } from '../scripts/android-pins.mjs';

// 回归测试：App 曾经因为 <pin-set> 放进 <base-config> 一启动就闪退
// （XmlConfigSource$ParserException: pin-set element not allowed in base-config），
// 而当时 22 个用例全绿 —— 因为它们不碰 network_security_config.xml。
// 这里按 AOSP 解析器的规则做静态校验：
//   frameworks/base/core/java/android/security/net/config/XmlConfigSource.java:255-301
// 只做语义校验，XML 是否合法由 aapt2 在 assembleDebug 时把关。

const here = path.dirname(fileURLToPath(import.meta.url));
const nativeDir = path.resolve(here, '..', 'native');
// CLOUD_CERT / PREVIEW_CERT 是相对仓库根写的；node --test 的 cwd 是 mobile/，
// 所以测试里显式解析（脚本内部会自己回退到仓库根，见 planAnchors 的 resolveSource）。
const cloudCert = path.resolve(REPO_ROOT, CLOUD_CERT);
const previewCert = path.resolve(REPO_ROOT, PREVIEW_CERT);

const CONFIG_FILE_RELEASE = 'network_security_config.xml';
const CONFIG_FILES = [CONFIG_FILE_RELEASE, 'network_security_config.debug.xml'];
const CERT_SRC = /^(system|user|wfa|@raw\/[A-Za-z0-9_.]+)$/;

// 注释里会出现 <pin-set> / <domain-config> 这类字样（就是用来警告不要这么写），
// 扫描前必须先摘掉，否则会把注释里的假标签当成真元素。
function stripComments(xml) {
  return xml.replace(/<!--[\s\S]*?-->/g, '');
}

// 极简 XML 扫描：只认标签与属性，够校验结构，不引第三方依赖。
function parseTags(xml) {
  const tags = [];
  const re = /<(\/?)([A-Za-z][\w.:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  let match;
  while ((match = re.exec(xml)) !== null) {
    const attrs = {};
    const attrRe = /([\w.:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let attr;
    while ((attr = attrRe.exec(match[3])) !== null) {
      attrs[attr[1]] = attr[3] !== undefined ? attr[3] : attr[4];
    }
    tags.push({ closing: match[1] === '/', selfClosing: match[4] === '/', name: match[2], attrs });
  }
  return tags;
}

// 按 AOSP 规则递归检查一个 config 元素（base-config / domain-config）。
function checkConfigEntry(tags, startIndex, configType) {
  const problems = [];
  let seenTrustAnchors = false;
  let seenPinSet = false;
  let domains = 0;
  let depth = 0;
  let index = startIndex;
  for (; index < tags.length; index += 1) {
    const tag = tags[index];
    if (tag.closing) {
      if (depth === 0) break;
      depth -= 1;
      continue;
    }
    if (tag.selfClosing) continue;
    if (depth === 0) {
      if (tag.name === 'domain') {
        if (configType !== 'domain-config') problems.push('domain element not allowed in ' + configType);
        domains += 1;
      } else if (tag.name === 'trust-anchors') {
        if (seenTrustAnchors) problems.push('Multiple trust-anchor elements not allowed');
        seenTrustAnchors = true;
      } else if (tag.name === 'pin-set') {
        // 核心回归点：AOSP 只允许 pin-set 出现在 domain-config 里。
        if (configType !== 'domain-config') problems.push('pin-set element not allowed in ' + configType);
        if (seenPinSet) problems.push('Multiple pin-set elements not allowed');
        seenPinSet = true;
      } else if (tag.name === 'domain-config') {
        problems.push('Nested domain-config not allowed in ' + configType);
      }
    }
    depth += 1;
  }
  if (configType === 'domain-config' && domains === 0) problems.push('No domain elements in domain-config');
  return { problems, endIndex: index };
}

function audit(xml) {
  const tags = parseTags(xml);
  const problems = [];
  let seenBaseConfig = false;
  for (let i = 0; i < tags.length; i += 1) {
    const tag = tags[i];
    if (tag.closing) continue;
    if (tag.name === 'base-config') {
      if (seenBaseConfig) problems.push('Only one base-config allowed');
      seenBaseConfig = true;
      const result = checkConfigEntry(tags, i + 1, 'base-config');
      problems.push(...result.problems);
      i = result.endIndex;
    } else if (tag.name === 'domain-config') {
      const result = checkConfigEntry(tags, i + 1, 'domain-config');
      problems.push(...result.problems);
      i = result.endIndex;
    } else if (tag.name === 'certificates') {
      const src = tag.attrs.src;
      if (src === undefined) problems.push('certificates element missing src attribute');
      else if (!CERT_SRC.test(src)) problems.push('Unknown certificates src: ' + src);
    }
  }
  if (!seenBaseConfig && !tags.some((t) => t.name === 'domain-config')) {
    problems.push('缺少 base-config');
  }
  return { tags, problems };
}

for (const name of CONFIG_FILES) {
  test('android 配置：' + name + ' 符合 AOSP 解析规则', () => {
    const file = path.join(nativeDir, name);
    assert.ok(fs.existsSync(file), '缺少 ' + name + '，先跑 npm run mobile:pins');
    const xml = stripComments(fs.readFileSync(file, 'utf8'));
    assert.equal((xml.match(/<network-security-config>/g) || []).length, 1, '缺少根元素');
    const { tags, problems } = audit(xml);
    assert.deepEqual(problems, [], name + ' 会被 Android 拒绝：' + problems.join('; '));
    assert.ok(tags.some((t) => t.name === 'trust-anchors'), name + ' 没有 trust-anchors');
  });
}

test('android 配置：release 禁明文、debug 放开明文', () => {
  const read = (name) => stripComments(fs.readFileSync(path.join(nativeDir, name), 'utf8'));
  const release = read('network_security_config.xml');
  const debug = read('network_security_config.debug.xml');
  assert.match(release, /<base-config cleartextTrafficPermitted="false">/);
  assert.match(debug, /<base-config cleartextTrafficPermitted="true">/);
});

// 信任锚可以有多张（云端 ECS + 本机预演栈）：App 里服务器地址是可填的，
// 锚按证书列而不是按地址列，这样两边都能连，又不会放松到信任公共 CA。
function anchorNames(xml) {
  return [...xml.matchAll(/<certificates\s+src="@raw\/([A-Za-z0-9_]+)"/g)].map((m) => m[1]);
}

test('android 配置：每份配置的信任锚都指向 native/ 下真实存在的证书', () => {
  for (const name of CONFIG_FILES) {
    const xml = stripComments(fs.readFileSync(path.join(nativeDir, name), 'utf8'));
    const srcs = anchorNames(xml);
    assert.ok(srcs.length > 0, name + ' 没有 @raw 信任锚');
    for (const src of srcs) {
      const pem = path.join(nativeDir, src + '.pem');
      assert.ok(fs.existsSync(pem), '缺少证书文件 ' + pem);
      assert.match(fs.readFileSync(pem, 'utf8'), /-----BEGIN CERTIFICATE-----/);
    }
  }
});

test('android 配置：native/ 下的 .pem 与信任锚一一对应（无孤儿、无悬空引用）', () => {
  const xml = stripComments(fs.readFileSync(path.join(nativeDir, CONFIG_FILE_RELEASE), 'utf8'));
  const referenced = anchorNames(xml).map((src) => src + '.pem').sort();
  const present = fs.readdirSync(nativeDir).filter((name) => name.endsWith('.pem')).sort();
  assert.deepEqual(present, referenced,
    'native/ 下的 .pem 与配置里引用的证书不一致：多出来的是没人用的孤儿，缺少的会让 App 连不上');
});

test('android 配置：release 与 debug 变体的信任锚完全一致', () => {
  const release = anchorNames(stripComments(fs.readFileSync(path.join(nativeDir, CONFIG_FILE_RELEASE), 'utf8')));
  const debug = anchorNames(stripComments(fs.readFileSync(path.join(nativeDir, 'network_security_config.debug.xml'), 'utf8')));
  assert.deepEqual(debug, release, '两个变体信任的证书必须一样，只有明文开关不同');
});

test('android 配置：AndroidManifest 引用了 network_security_config', () => {
  const manifest = path.resolve(here, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
  if (!fs.existsSync(manifest)) return; // 还没 prebuild，跳过
  const xml = fs.readFileSync(manifest, 'utf8');
  assert.match(xml, /android:networkSecurityConfig="@xml\/network_security_config"/);
  const targets = [
    path.resolve(here, '..', 'android', 'app', 'src', 'main', 'res', 'xml', 'network_security_config.xml'),
    path.resolve(here, '..', 'android', 'app', 'src', 'debug', 'res', 'xml', 'network_security_config.xml'),
    // debugOptimized 是 RN gradle plugin 建的变体，只继承 debug 的配置不继承它的 sourceSet
    path.resolve(here, '..', 'android', 'app', 'src', 'debugOptimized', 'res', 'xml', 'network_security_config.xml'),
  ];
  for (const target of targets) {
    assert.ok(fs.existsSync(target), '补丁没打全：缺 ' + target);
  }
  const rawDir = path.resolve(here, '..', 'android', 'app', 'src', 'main', 'res', 'raw');
  const expected = fs.readdirSync(nativeDir).filter((name) => name.endsWith('.pem')).sort();
  const actual = fs.existsSync(rawDir) ? fs.readdirSync(rawDir).filter((name) => name.endsWith('.pem')).sort() : [];
  assert.deepEqual(actual, expected, '补丁没打全：res/raw 里的信任锚与 native/ 不一致');
});

// 直接对旧写法做断言，防止有人把 pin-set 又搬回 base-config。
test('android 配置：base-config 里不允许出现 pin-set', () => {
  for (const name of CONFIG_FILES) {
    const xml = stripComments(fs.readFileSync(path.join(nativeDir, name), 'utf8'));
    assert.doesNotMatch(xml, /<pin-set/, name + ' 里的 pin-set 会让 App 启动闪退，改用 @raw 信任锚');
    assert.doesNotMatch(xml, /<domain-config/, name + ' 不需要 domain-config：服务器地址是可配置的，域名写死会连不上');
  }
});

// 上一版把证书写死在 native/hengbeger_server.pem，换方案后脚本要能吃多张锚。
test('信任锚：planAnchors 缺云端证书时明确报错（不能静默签出没有锚的配置）', () => {
  assert.throws(() => planAnchors({ cloud: path.join(nativeDir, 'not-exists.crt') }), /缺少证书/);
});

test('信任锚：预演证书不存在时跳过，不报错（deploy/ssl/ 不进仓库）', () => {
  const anchors = planAnchors({ cloud: cloudCert, preview: path.join(nativeDir, 'not-exists.crt') });
  assert.equal(anchors.length, 1);
  assert.equal(anchors[0].raw, 'cloud_server');
});

test('信任锚：同一张证书只留一份（按指纹去重）', () => {
  const anchors = planAnchors({ cloud: cloudCert, preview: cloudCert, extra: [cloudCert] });
  assert.equal(anchors.length, 1, '同一张证书被列了三次');
});

test('信任锚：真实存在的证书都能读出 SAN，且至少有一张云端证书', () => {
  const anchors = planAnchors({ cloud: cloudCert, preview: previewCert });
  assert.ok(anchors.length >= 1, '一张信任锚都没有');
  assert.equal(anchors[0].source, cloudCert, '云端证书必须排第一（App 默认连它）');
  for (const anchor of anchors) {
    assert.ok(anchor.certificate.subjectAltName, anchor.raw + ' 的证书没有 SAN，主机名校验会失败');
    assert.match(anchor.file, /^[a-z][a-z0-9_]*\.pem$/, 'res/raw 资源名必须是小写字母开头的 [a-z0-9_]');
  }
});

test('信任锚：rawNameFor 把任意路径变成合法 res/raw 资源名', () => {
  assert.equal(rawNameFor('deploy/certs/cloud-server.crt'), 'cloud_server');
  assert.equal(rawNameFor('deploy/ssl/server.crt'), 'server');
  assert.equal(rawNameFor('a/2 weird-name.pem'), 'cert_2_weird_name');
});

test('信任锚：生成的配置里每张证书各有一行 certificates', () => {
  const xml = securityConfigXml({ cleartext: false, anchors: ['cloud_server', 'server'] });
  assert.match(xml, /<certificates src="@raw\/cloud_server" \/>/);
  assert.match(xml, /<certificates src="@raw\/server" \/>/);
  assert.equal((xml.match(/<certificates/g) || []).length, 2);
});

// 换掉信任锚文件（例如从 hengbeger_server.pem 改成 cloud_server.pem）时，
// 旧的 @raw 资源如果留在 res/raw 里会被 aapt2 一起打进包，谁在信任谁就说不清了。
test('信任锚：res/raw 里不留上一版没人引用的旧锚', () => {
  const rawDir = path.resolve(here, '..', 'android', 'app', 'src', 'main', 'res', 'raw');
  if (!fs.existsSync(rawDir)) return; // 还没 prebuild，跳过
  const referenced = new Set(anchorNames(stripComments(fs.readFileSync(path.join(nativeDir, CONFIG_FILE_RELEASE), 'utf8'))).map((s) => s + '.pem'));
  const stale = fs.readdirSync(rawDir).filter((name) => name.endsWith('.pem') && !referenced.has(name));
  assert.deepEqual(stale, [], 'res/raw 里有没人引用的旧信任锚，重跑 npm run mobile:patch');
});

// npm --prefix mobile run … 的 cwd 是 mobile/，而 CLOUD_CERT 是相对仓库根写的。
// 脚本必须自己回退到仓库根，否则「在 mobile/ 里跑 pins」会误报缺证书。
test('信任锚：从非仓库根的 cwd 调用也能找到默认证书', () => {
  const before = process.cwd();
  try {
    process.chdir(path.resolve(here, '..')); // mobile/
    const anchors = planAnchors({ preview: path.join(nativeDir, 'not-exists.crt') });
    assert.equal(anchors.length, 1);
    assert.equal(anchors[0].raw, 'cloud_server');
    assert.match(fs.readFileSync(path.resolve(REPO_ROOT, anchors[0].source), 'utf8'), /-----BEGIN CERTIFICATE-----/);
  } finally {
    process.chdir(before);
  }
});

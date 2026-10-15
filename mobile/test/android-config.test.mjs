import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// 回归测试：App 曾经因为 <pin-set> 放进 <base-config> 一启动就闪退
// （XmlConfigSource$ParserException: pin-set element not allowed in base-config），
// 而当时 22 个用例全绿 —— 因为它们不碰 network_security_config.xml。
// 这里按 AOSP 解析器的规则做静态校验：
//   frameworks/base/core/java/android/security/net/config/XmlConfigSource.java:255-301
// 只做语义校验，XML 是否合法由 aapt2 在 assembleDebug 时把关。

const here = path.dirname(fileURLToPath(import.meta.url));
const nativeDir = path.resolve(here, '..', 'native');

const CONFIG_FILES = ['network_security_config.xml', 'network_security_config.debug.xml'];
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

test('android 配置：信任锚指向 res/raw 里真实存在的证书', () => {
  const xml = stripComments(fs.readFileSync(path.join(nativeDir, 'network_security_config.xml'), 'utf8'));
  const srcs = [...xml.matchAll(/<certificates\s+src="@raw\/([A-Za-z0-9_]+)"/g)].map((m) => m[1]);
  assert.ok(srcs.length > 0, '没有 @raw 信任锚');
  for (const src of srcs) {
    const pem = path.join(nativeDir, src + '.pem');
    assert.ok(fs.existsSync(pem), '缺少证书文件 ' + pem);
    assert.match(fs.readFileSync(pem, 'utf8'), /-----BEGIN CERTIFICATE-----/);
  }
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
  const rawTarget = path.resolve(here, '..', 'android', 'app', 'src', 'main', 'res', 'raw', 'hengbeger_server.pem');
  assert.ok(fs.existsSync(rawTarget), '补丁没打全：缺 ' + rawTarget);
});

// 直接对旧写法做断言，防止有人把 pin-set 又搬回 base-config。
test('android 配置：base-config 里不允许出现 pin-set', () => {
  for (const name of CONFIG_FILES) {
    const xml = stripComments(fs.readFileSync(path.join(nativeDir, name), 'utf8'));
    assert.doesNotMatch(xml, /<pin-set/, name + ' 里的 pin-set 会让 App 启动闪退，改用 @raw 信任锚');
    assert.doesNotMatch(xml, /<domain-config/, name + ' 不需要 domain-config：服务器地址是可配置的，域名写死会连不上');
  }
});

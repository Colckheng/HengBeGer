'use strict';
// 桌面客户端的配置与「服务器地址」处理，纯逻辑、无 Electron 依赖 —— 这样能直接用 node --test 跑。
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_SERVER = 'https://127.0.0.1:8444';

// 用户输入什么都尽量救回来：'127.0.0.1:8444' / 'example.com' / 'https://a.b:8443/' 都要能变成合法 URL。
// 没有协议就补 https（大陆无域名 + 自签证书的场景，明文 http 只在明确写 http:// 时才接受）。
function normalizeServerUrl(input) {
  const raw = String(input == null ? '' : input).trim();
  if (!raw) return { ok: false, error: '地址不能为空' };
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : 'https://' + raw;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, error: '这不是一个合法的地址：' + raw };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: '只支持 http/https，收到的是 ' + url.protocol };
  }
  if (!url.hostname) return { ok: false, error: '地址里没有主机名' };
  url.hash = '';
  url.search = '';
  // 根路径就是 '/'：直接拼 origin，避免出现 'https://host:port/' 这种带尾斜杠的形态。
  const cleanedPath = url.pathname.replace(/\/+$/, '');
  return { ok: true, url: url.origin + cleanedPath };
}

function settingsFile(userDataDir) {
  return path.join(userDataDir, 'settings.json');
}

function readSettings(userDataDir) {
  const base = { serverUrl: '', trustedHosts: {}, windowBounds: null };
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsFile(userDataDir), 'utf8'));
    return { ...base, ...parsed, trustedHosts: { ...base.trustedHosts, ...(parsed.trustedHosts || {}) } };
  } catch {
    return base;
  }
}

function writeSettings(userDataDir, settings) {
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(settingsFile(userDataDir), JSON.stringify(settings, null, 2) + '\n', 'utf8');
  return settings;
}

module.exports = { DEFAULT_SERVER, normalizeServerUrl, settingsFile, readSettings, writeSettings };

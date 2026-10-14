#!/usr/bin/env node
// 本机预演验收：走完整链路 TLS -> nginx -> Node -> MySQL，逐条打勾。
//
//   node deploy/scripts/verify-preview.mjs
//   node deploy/scripts/verify-preview.mjs --url https://127.0.0.1:8444
//
// 自签证书 => 这里显式关掉证书校验，只验「链路通不通、边界守不守得住」。
// 退出码 0 = 全部通过。

import https from 'node:https';
import tls from 'node:tls';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { URL } from 'node:url';

const argv = process.argv.slice(2);
const urlIndex = argv.indexOf('--url');
const base = new URL(urlIndex >= 0 && argv[urlIndex + 1] ? argv[urlIndex + 1] : 'https://127.0.0.1:8444');
const port = Number(base.port || 443);
const isIpLiteral = /^\d{1,3}(\.\d{1,3}){3}$/.test(base.hostname) || base.hostname.includes(':');

// 证书必须在握手期间读：响应结束后 res.socket 已被销毁，读不到 peer certificate。
function probeCertificate() {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: base.hostname,
      port,
      rejectUnauthorized: false,
      // RFC 6066 不允许把 IP 写进 SNI，写了对端会忽略并打 DeprecationWarning。
      ...(isIpLiteral ? {} : { servername: base.hostname }),
      timeout: 15000,
    }, () => {
      const cert = socket.getPeerCertificate();
      const protocol = socket.getProtocol();
      socket.end();
      resolve({ cert, protocol });
    });
    socket.on('timeout', () => socket.destroy(new Error('TLS 握手超时（15s）')));
    socket.on('error', reject);
  });
}

// 本机 deploy/ssl/server.crt 的指纹；文件不存在时返回 null（只报告、不断言）。
function localCertFingerprint() {
  try {
    const pem = fs.readFileSync(new URL('../ssl/server.crt', import.meta.url));
    return new crypto.X509Certificate(pem).fingerprint256;
  } catch {
    return null;
  }
}

function request(pathname, { method = 'GET' } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: base.hostname,
      port: base.port || 443,
      path: pathname,
      method,
      rejectUnauthorized: false,
      // 同上：SNI 不能是 IP 字面量。
      ...(isIpLiteral ? {} : { servername: base.hostname }),
      timeout: 15000,
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body, socket: res.socket }));
    });
    req.on('timeout', () => req.destroy(new Error('请求超时（15s）')));
    req.on('error', reject);
    req.end();
  });
}

const checks = [];
const record = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(44) + (detail ?? ''));
};

console.log('[verify] 目标 ' + base.origin);

let health;
try {
  health = await request('/health/live');
} catch (error) {
  console.error('\n[verify] 连不上 ' + base.origin + '：' + error.message);
  console.error('         先确认 docker compose 已起：npm run cloud:preview:up');
  process.exit(2);
}

let probe = null;
try { probe = await probeCertificate(); } catch (error) { probe = { error }; }
const cert = probe && probe.cert && Object.keys(probe.cert).length > 0 ? probe.cert : null;
record('TLS 握手完成', Boolean(cert), cert
  ? 'CN=' + (cert.subject ? cert.subject.CN : '?') + '，' + probe.protocol + '，到期 ' + cert.valid_to
  : (probe && probe.error ? '失败：' + probe.error.message : '未取到对端证书'));

const expectedFingerprint = localCertFingerprint();
const actualFingerprint = cert && cert.fingerprint256 ? cert.fingerprint256 : null;
const fingerprintOk = Boolean(actualFingerprint) && (!expectedFingerprint || actualFingerprint === expectedFingerprint);
record('证书指纹', fingerprintOk, actualFingerprint
  ? actualFingerprint + (expectedFingerprint
    ? (actualFingerprint === expectedFingerprint ? '（与 deploy/ssl/server.crt 一致）' : '（与 deploy/ssl/server.crt 不一致，期望 ' + expectedFingerprint + '）')
    : '（本地无 deploy/ssl/server.crt，跳过比对）')
  : '未取到指纹');

record('GET /health/live -> 200', health.status === 200, 'HTTP ' + health.status + ' ' + health.body.slice(0, 120));

const ready = await request('/health/ready');
record('GET /health/ready -> 200', ready.status === 200, 'HTTP ' + ready.status + ' ' + ready.body.slice(0, 120));

const root = await request('/');
const rootOk = root.status === 200 && /<div id="root"|<script/i.test(root.body);
record('GET / -> 200 HTML', rootOk, 'HTTP ' + root.status + '，' + root.body.length + ' 字节');

const index = await request('/api/catalog/index');
let indexJson = null;
try { indexJson = JSON.parse(index.body); } catch { /* 可能是 nginx 的 403 页面 */ }
const entryCount = indexJson && Array.isArray(indexJson.entries) ? indexJson.entries.length
  : indexJson && Array.isArray(indexJson.items) ? indexJson.items.length
  : null;
// 空库上 server/catalog.js:20 会按设计返回 503「资料库尚未导入」；导入数据（阶段 3）后应变成 200 + 条目数。
const notImported = index.status === 503 && Boolean(indexJson) && typeof indexJson.error === 'string' && indexJson.error.indexOf('尚未导入') >= 0;
record('GET /api/catalog/index', (index.status === 200 && indexJson !== null) || notImported,
  index.status === 200
    ? 'HTTP 200，条目数 ' + (entryCount === null ? '未知（响应里没有 entries/items 数组）' : entryCount)
    : notImported
      ? 'HTTP 503，空库未导入（符合预期；阶段 3 导入后应为 200 并显示条目数）'
      : 'HTTP ' + index.status + ' ' + index.body.slice(0, 120));

for (const [pathname, label] of [
  ['/api/data', '旧后台全量导出'],
  ['/api/auth/session', '后台登录态'],
  ['/api/storage/status', '本机存储状态'],
  ['/metrics', 'Prometheus 指标'],
]) {
  const res = await request(pathname);
  record('nginx 封禁 ' + pathname + ' -> 403', res.status === 403, 'HTTP ' + res.status + '（' + label + '）');
}

const missing = await request('/img/does-not-exist.png');
record('GET /img/* 缺文件 -> 404', missing.status === 404, 'HTTP ' + missing.status);

const failed = checks.filter((c) => !c.ok);
console.log('');
if (failed.length === 0) {
  console.log('[verify] 全部通过（' + checks.length + '/' + checks.length + '）');
  process.exit(0);
}
console.log('[verify] 失败 ' + failed.length + '/' + checks.length + '：' + failed.map((c) => c.name).join('；'));
process.exit(1);

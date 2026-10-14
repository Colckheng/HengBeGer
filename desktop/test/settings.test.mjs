import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizeServerUrl, DEFAULT_SERVER, readSettings, writeSettings } = require('../src/settings.js');

test('默认地址是自签 https', () => {
  assert.equal(DEFAULT_SERVER, 'https://127.0.0.1:8444');
});

test('没写协议时补 https', () => {
  assert.deepEqual(normalizeServerUrl('127.0.0.1:8444'), { ok: true, url: 'https://127.0.0.1:8444' });
  assert.deepEqual(normalizeServerUrl('47.98.1.2:8443'), { ok: true, url: 'https://47.98.1.2:8443' });
});

test('去掉尾部斜杠与 query/hash', () => {
  assert.deepEqual(normalizeServerUrl('https://a.example:8443///'), { ok: true, url: 'https://a.example:8443' });
  assert.deepEqual(normalizeServerUrl('https://a.example:8443/?x=1#y'), { ok: true, url: 'https://a.example:8443' });
});

test('保留显式的 http://', () => {
  assert.deepEqual(normalizeServerUrl('http://127.0.0.1:3001'), { ok: true, url: 'http://127.0.0.1:3001' });
});

test('拒绝空值与非 http(s) 协议', () => {
  assert.equal(normalizeServerUrl('   ').ok, false);
  assert.equal(normalizeServerUrl('file:///etc/passwd').ok, false);
  assert.equal(normalizeServerUrl('ftp://a.b').ok, false);
});

test('拒绝乱七八糟的输入', () => {
  assert.equal(normalizeServerUrl('https://').ok, false);
  assert.equal(normalizeServerUrl(':::').ok, false);
});

test('配置读写往返', () => {
  const dir = process.cwd() + '/.tmp-test-userdata';
  writeSettings(dir, { serverUrl: 'https://1.2.3.4:8443', trustedHosts: { '1.2.3.4:8443': 'AA:BB' } });
  const back = readSettings(dir);
  assert.equal(back.serverUrl, 'https://1.2.3.4:8443');
  assert.equal(back.trustedHosts['1.2.3.4:8443'], 'AA:BB');
  assert.deepEqual(readSettings(dir + '/nonexistent'), { serverUrl: '', trustedHosts: {}, windowBounds: null });
});

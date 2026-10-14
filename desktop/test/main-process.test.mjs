import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const stubPath = path.join(import.meta.dirname, 'electron-stub.cjs');
const testUserData = path.join(os.tmpdir(), 'hengbeger-main-test-' + process.pid);
process.env.HENGBERGER_TEST_USERDATA = testUserData;

// 把 main.js 里的 require('electron') 指向替身，必须在 require main.js 之前装好。
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'electron') return stubPath;
  return originalResolve.call(this, request, ...rest);
};

const stub = require('./electron-stub.cjs');
const state = stub.__state;
const main = require('../main.js');
await new Promise((resolve) => setImmediate(resolve));

function settingsOnDisk() {
  return JSON.parse(fs.readFileSync(path.join(testUserData, 'settings.json'), 'utf8'));
}

async function emitCertificateError(url, fingerprint) {
  const calls = [];
  const event = { preventDefault: () => calls.push('preventDefault') };
  state.appListeners.get('certificate-error').forEach((fn) =>
    fn(event, null, url, 'net::ERR_CERT_AUTHORITY_INVALID', { fingerprint }, (ok) => calls.push(ok))
  );
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));
  return calls;
}

test('未配置服务器时先开设置窗口（不直接连任何东西）', () => {
  assert.equal(state.windows.length, 1);
  assert.ok(state.windows[0].loadedFile.endsWith('setup.html'));
  assert.equal(state.menuSet, true);
});

test('自签证书：弹窗确认后记住指纹，再连同一指纹不再问', async () => {
  state.dialogResponse = 0;
  const first = await emitCertificateError('https://127.0.0.1:8444/health/live', 'sha256/AA:BB:CC');
  assert.deepEqual(first, ['preventDefault', true]);
  assert.equal(state.dialogs.length, 1);
  assert.match(state.dialogs[0].detail, /AA:BB:CC/);
  assert.equal(settingsOnDisk().trustedHosts['127.0.0.1:8444'], 'AA:BB:CC');

  const second = await emitCertificateError('https://127.0.0.1:8444/api/catalog/index', 'sha256/AA:BB:CC');
  assert.deepEqual(second, ['preventDefault', true]);
  assert.equal(state.dialogs.length, 1, '已信任的指纹不应该再弹窗');
});

test('自签证书：指纹变了要重新问，用户拒绝就不放行', async () => {
  state.dialogResponse = 1;
  const calls = await emitCertificateError('https://127.0.0.1:8444/', 'sha256:99:88');
  assert.deepEqual(calls, [false]);
  assert.equal(state.dialogs.length, 2);
  assert.equal(settingsOnDisk().trustedHosts['127.0.0.1:8444'], 'AA:BB:CC', '拒绝后不能覆盖已信任指纹');
});

test('保存服务器地址：非法输入被拒，合法输入落盘并打开主窗口', async () => {
  const save = state.handlers.get('desktop:save-server');
  assert.deepEqual(await save(null, '   '), { ok: true, reopenedSetup: true });
  const bad = await save(null, 'file:///etc/passwd');
  assert.equal(bad.ok, false);

  const good = await save(null, '47.98.1.2:8443');
  assert.deepEqual(good, { ok: true, url: 'https://47.98.1.2:8443' });
  assert.equal(settingsOnDisk().serverUrl, 'https://47.98.1.2:8443');
  const mainWindow = state.windows[state.windows.length - 1];
  assert.equal(mainWindow.loadedUrl, 'https://47.98.1.2:8443');
  assert.ok(!mainWindow.options.show, '窗口先隐藏，等 ready-to-show 再显示');

  const st = await state.handlers.get('desktop:state')(null);
  assert.equal(st.serverUrl, 'https://47.98.1.2:8443');
  assert.equal(st.defaultServer, 'https://127.0.0.1:8444');
  assert.deepEqual(st.trustedHosts, ['127.0.0.1:8444']);
});

test('主窗口把加载失败引到本地错误页，忽略 -3（导航被中止）', async () => {
  const win = state.windows[state.windows.length - 1];
  win.webContents.emit('did-fail-load', {}, -3, 'ABORTED', 'https://47.98.1.2:8443/', true);
  assert.equal(win.loadedFile, undefined, '-3 不翻错误页');
  win.webContents.emit('did-fail-load', {}, -102, 'ERR_CONNECTION_REFUSED', 'https://47.98.1.2:8443/', true);
  assert.ok(win.loadedFile.endsWith('error.html'));
  assert.equal(win.loadedFileQuery.url, 'https://47.98.1.2:8443/');
  assert.match(win.loadedFileQuery.why, /ERR_CONNECTION_REFUSED/);
  // 本地错误页自己失败时不能再递归翻页
  const before = win.loadedFile;
  win.webContents.emit('did-fail-load', {}, -6, 'ERR_FILE_NOT_FOUND', 'file:///C:/x/error.html', true);
  assert.equal(win.loadedFile, before);
});

test('窗口关闭时记住尺寸', () => {
  const win = state.windows[state.windows.length - 1];
  win.bounds = { width: 1111, height: 777 };
  win.emit('close');
  assert.deepEqual(settingsOnDisk().windowBounds, { width: 1111, height: 777 });
});

test('外部链接只放行 http(s)', async () => {
  const open = state.handlers.get('desktop:open-external');
  await open(null, 'javascript:alert(1)');
  await open(null, 'https://example.com/x');
  assert.deepEqual(state.openedExternal, ['https://example.com/x']);
});

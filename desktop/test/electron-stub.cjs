'use strict';
// 'electron' 的替身：只实现 main.js 用到的那些面，让主进程逻辑能脱离 GUI/Chromium 用 node --test 跑。
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const state = {
  userDataDir: process.env.HENGBERGER_TEST_USERDATA || path.join(os.tmpdir(), 'hengbeger-test-userdata'),
  handlers: new Map(),
  appListeners: new Map(),
  windows: [],
  dialogs: [],
  dialogResponse: 0,
  openedExternal: [],
  exited: [],
  menuSet: false,
};

class FakeWebContents {
  constructor(win) {
    this.win = win;
    this.listeners = new Map();
    this.url = '';
    this.title = 'fake';
    this.captured = null;
  }
  on(event, fn) { (this.listeners.get(event) || this.listeners.set(event, []).get(event)).push(fn); return this; }
  once(event, fn) { return this.on(event, fn); }
  emit(event, ...args) { for (const fn of this.listeners.get(event) || []) fn(...args); }
  getURL() { return this.url; }
  getTitle() { return this.title; }
  reload() { this.reloaded = true; }
  reloadIgnoringCache() { this.reloadedIgnoringCache = true; }
  async executeJavaScript() { return 7; }
  async capturePage() { return { toPNG: () => Buffer.from('png-bytes'), getSize: () => ({ width: 1280, height: 900 }) }; }
}

class BrowserWindow {
  constructor(options = {}) {
    this.options = options;
    this.webContents = new FakeWebContents(this);
    this.destroyed = false;
    this.shown = false;
    this.bounds = { width: options.width || 1280, height: options.height || 880 };
    this.listeners = new Map();
    state.windows.push(this);
  }
  on(event, fn) { (this.listeners.get(event) || this.listeners.set(event, []).get(event)).push(fn); return this; }
  once(event, fn) { return this.on(event, fn); }
  emit(event, ...args) { for (const fn of this.listeners.get(event) || []) fn(...args); }
  loadURL(url) { this.webContents.url = url; this.loadedUrl = url; return Promise.resolve(); }
  loadFile(file, opts) { this.loadedFile = file; this.loadedFileQuery = opts && opts.query; this.webContents.url = 'file://' + file; return Promise.resolve(); }
  show() { this.shown = true; }
  focus() { this.focused = true; }
  isDestroyed() { return this.destroyed; }
  isMinimized() { return false; }
  isFullScreen() { return false; }
  getBounds() { return this.bounds; }
  setMenuBarVisibility(v) { this.menuBarVisible = v; }
  close() { this.destroyed = true; this.emit('closed'); }
}

const app = {
  getPath: (name) => (name === 'userData' ? state.userDataDir : path.join(state.userDataDir, name)),
  on: (event, fn) => { (state.appListeners.get(event) || state.appListeners.set(event, []).get(event)).push(fn); return app; },
  once: (event, fn) => app.on(event, fn),
  emit: (event, ...args) => { for (const fn of state.appListeners.get(event) || []) fn(...args); },
  whenReady: () => Promise.resolve(),
  getVersion: () => '0.1.0-test',
  quit: () => { state.quitCalled = true; },
  exit: (code) => { state.exited.push(code); },
  isReady: () => true,
};

const ipcMain = { handle: (channel, fn) => { state.handlers.set(channel, fn); return ipcMain; } };

const dialog = {
  showMessageBox: async (opts) => {
    state.dialogs.push(opts);
    return { response: state.dialogResponse };
  },
};

const shell = { openExternal: async (url) => { state.openedExternal.push(url); } };

const Menu = {
  setApplicationMenu: () => { state.menuSet = true; },
  buildFromTemplate: (template) => template,
};

module.exports = { app, BrowserWindow, ipcMain, dialog, shell, Menu, __state: state, __reset: () => {
  state.handlers.clear(); state.appListeners.clear(); state.windows.length = 0; state.dialogs.length = 0;
  state.openedExternal.length = 0; state.exited.length = 0; state.dialogResponse = 0; state.menuSet = false;
  try { fs.rmSync(state.userDataDir, { recursive: true, force: true }); } catch { /* 无所谓 */ }
} };

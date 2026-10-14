'use strict';
// HengBerGer 桌面客户端主进程：一个读云端站点的窗口壳，外加自签证书的显式信任流程。
// 目标是复用已经验收过的 Web 界面，不重新实现浏览逻辑。
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_SERVER, normalizeServerUrl, readSettings, writeSettings } = require('./src/settings');

const SMOKE = process.argv.includes('--smoke');
const SMOKE_TIMEOUT_MS = 45000;
const SETUP_PAGE = path.join(__dirname, 'renderer', 'setup.html');
const ERROR_PAGE = path.join(__dirname, 'renderer', 'error.html');

// smoke 模式写一份落地日志：没有控制台可看时（GUI 子系统进程、被宿主吞掉 stdout）这是唯一的现场。
const SMOKE_TRACE = SMOKE ? path.join(__dirname, '.smoke', 'trace.log') : null;
function trace(...parts) {
  if (!SMOKE_TRACE) return;
  try {
    fs.mkdirSync(path.dirname(SMOKE_TRACE), { recursive: true });
    fs.appendFileSync(SMOKE_TRACE, new Date().toISOString() + ' ' + parts.join(' ') + '\n', 'utf8');
  } catch {
    /* 诊断日志本身不能成为故障点 */
  }
}
trace('module loaded; argv=' + JSON.stringify(process.argv.slice(1)) + '; electron=' + process.versions.electron);

const userDataDir = app.getPath('userData');
let settings = readSettings(userDataDir);
trace('settings loaded; serverUrl=' + (settings.serverUrl || '(empty)') + '; userData=' + userDataDir);
let mainWindow = null;
let setupWindow = null;

function persist() {
  writeSettings(userDataDir, settings);
}

// certificate.fingerprint 形如 'sha256/AA:BB:...'（老版本是裸指纹），统一成大写裸指纹再比。
function normalizeFingerprint(value) {
  return String(value || '').replace(/^[a-z0-9]+\//i, '').trim().toUpperCase();
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

// 自签证书：只有指纹被显式信任过才放行；没信任过就弹窗把指纹亮给用户看。
// 不做「一律 ignore」——那等于关掉 TLS，和设计文档里「App 内固定指纹」是一个道理的 Web 等价物。
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  const host = hostOf(url);
  const fingerprint = normalizeFingerprint(certificate && certificate.fingerprint);
  if (!host) {
    callback(false);
    return;
  }
  trace('certificate-error host=' + host + ' error=' + error + ' fp=' + fingerprint);
  if (settings.trustedHosts[host] && settings.trustedHosts[host] === fingerprint) {
    event.preventDefault();
    callback(true);
    return;
  }
  if (SMOKE) {
    settings.trustedHosts[host] = fingerprint;
    persist();
    event.preventDefault();
    callback(true);
    return;
  }
  dialog
    .showMessageBox({
      type: 'warning',
      buttons: ['信任并继续', '取消'],
      defaultId: 1,
      cancelId: 1,
      title: '自签证书确认',
      message: '无法验证 ' + host + ' 的证书',
      detail:
        '原因：' + error + '\n\n' +
        '证书指纹（SHA-256）：\n' + fingerprint + '\n\n' +
        '只有当你确认这个指纹与服务器 deploy/ssl/server.crt 一致时才继续。',
    })
    .then(({ response }) => {
      if (response !== 0) {
        callback(false);
        return;
      }
      settings.trustedHosts[host] = fingerprint;
      persist();
      event.preventDefault();
      callback(true);
    })
    .catch(() => callback(false));
});

function openSetupWindow() {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.focus();
    return;
  }
  setupWindow = new BrowserWindow({
    width: 560,
    height: 470,
    resizable: false,
    title: '连接 HengBerGer',
    backgroundColor: '#14161c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  setupWindow.setMenuBarVisibility(false);
  setupWindow.loadFile(SETUP_PAGE);
  setupWindow.on('closed', () => {
    setupWindow = null;
  });
}

function showLoadError(win, code, description, failedUrl) {
  const why = '[' + code + '] ' + description;
  win.loadFile(ERROR_PAGE, { query: { why, url: failedUrl || '' } });
}

function createMainWindow(url) {
  const bounds = settings.windowBounds || { width: 1280, height: 880 };
  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 920,
    minHeight: 620,
    show: false,
    title: 'HengBerGer',
    backgroundColor: '#14161c',
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  mainWindow.once('ready-to-show', () => {
    if (!SMOKE) mainWindow.show();
  });
  mainWindow.webContents.on('did-fail-load', (event, code, description, failedUrl, isMainFrame) => {
    // -3 是「被下一次导航中止」，属正常，不是错误。
    if (!isMainFrame || code === -3) return;
    // 本地错误页自己的失败不再递归。
    if (String(failedUrl || '').startsWith('file:')) return;
    showLoadError(mainWindow, code, description, failedUrl);
  });
  mainWindow.on('close', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const b = mainWindow.getBounds();
    settings.windowBounds = { width: b.width, height: b.height };
    persist();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.loadURL(url);
}

function loadServer() {
  if (!settings.serverUrl) {
    openSetupWindow();
    return;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(settings.serverUrl);
    return;
  }
  createMainWindow(settings.serverUrl);
}

function buildMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '切换服务器地址…', accelerator: 'CmdOrCtrl+Shift+S', click: () => openSetupWindow() },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', accelerator: 'CmdOrCtrl+R', click: () => mainWindow && mainWindow.reload() },
        { label: '强制重新加载（清站点缓存）', accelerator: 'CmdOrCtrl+Shift+R', click: () => mainWindow && mainWindow.webContents.reloadIgnoringCache() },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
        { role: 'toggleDevTools', label: '开发者工具' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '打开运维说明（deploy/README.md）',
          click: () => shell.openExternal('https://github.com/Colckheng/HengBeGer/blob/main/deploy/README.md'),
        },
        {
          label: '关于',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: '关于 HengBerGer',
              message: 'HengBerGer 桌面客户端 ' + app.getVersion(),
              detail: 'Electron ' + process.versions.electron + ' / Chromium ' + process.versions.chrome + '\n当前服务器：' + (settings.serverUrl || '未设置'),
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('desktop:state', () => ({
  serverUrl: settings.serverUrl,
  defaultServer: DEFAULT_SERVER,
  version: app.getVersion(),
  trustedHosts: Object.keys(settings.trustedHosts),
}));

ipcMain.handle('desktop:save-server', (event, input) => {
  // 空值 = 「我要改地址」，把设置窗口顶出来，不改动已存的地址。
  if (input == null || String(input).trim() === '') {
    openSetupWindow();
    return { ok: true, reopenedSetup: true };
  }
  const res = normalizeServerUrl(input);
  if (!res.ok) return res;
  settings.serverUrl = res.url;
  persist();
  if (setupWindow && !setupWindow.isDestroyed()) setupWindow.close();
  loadServer();
  return { ok: true, url: res.url };
});

ipcMain.handle('desktop:open-external', (event, url) => {
  if (/^https?:\/\//i.test(String(url))) shell.openExternal(String(url));
  return true;
});

ipcMain.handle('desktop:quit', () => {
  app.quit();
  return true;
});

// --smoke：无人值守自检。加载配置的服务器（没配就先用默认值），等首屏数据到位，截屏存盘，
// 打印一行 JSON 供 CI/脚本判定，然后退出。exit code：0 成功、1 加载失败、2 超时。
async function runSmoke() {
  const target = settings.serverUrl || DEFAULT_SERVER;
  settings.serverUrl = target;
  persist();
  const consoleMessages = [];
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const finish = (payload, code) => {
    trace('finish code=' + code + ' payload=' + JSON.stringify(payload).slice(0, 400));
    try {
      fs.writeFileSync(path.join(__dirname, '.smoke', 'result.json'), JSON.stringify(payload, null, 2), 'utf8');
    } catch {
      /* 写不进结果文件也要让退出码说话 */
    }
    console.log(JSON.stringify(payload, null, 2));
    app.exit(code);
  };
  const timer = setTimeout(() => {
    trace('TIMEOUT after ' + SMOKE_TIMEOUT_MS + 'ms');
    finish({ ok: false, reason: 'timeout', url: target, consoleMessages: consoleMessages.slice(0, 10) }, 2);
  }, SMOKE_TIMEOUT_MS);
  // Electron 35 起 console-message 的把式变了（第二参从 level 数字变成 details 对象），两种都兼容。
  win.webContents.on('console-message', (...args) => {
    const details = args[1];
    if (details && typeof details === 'object' && 'level' in details) {
      if (String(details.level) === 'warning' || String(details.level) === 'error') {
        consoleMessages.push({ level: details.level, message: details.message, line: details.lineNumber });
      }
      return;
    }
    const [_event, level, message, line, sourceId] = args;
    if (typeof level === 'number' && level >= 2) consoleMessages.push({ level, message, sourceId, line });
  });
  win.webContents.on('did-fail-load', (event, code, description, failedUrl, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    clearTimeout(timer);
    finish({ ok: false, reason: 'did-fail-load', code, description, url: failedUrl }, 1);
  });
  win.webContents.once('did-finish-load', async () => {
    trace('did-finish-load url=' + win.webContents.getURL());
    // 等首屏把 /api/catalog/index（约 2.5MB）拉完再截图。
    await new Promise((resolve) => setTimeout(resolve, 5000));
    try {
      trace('capturing page');
      const image = await win.capturePage();
      trace('captured ' + image.getSize().width + 'x' + image.getSize().height);
      const outDir = path.join(__dirname, '.smoke');
      fs.mkdirSync(outDir, { recursive: true });
      const outFile = path.join(outDir, 'screenshot.png');
      fs.writeFileSync(outFile, image.toPNG());
      const cards = await win.webContents.executeJavaScript(
        'document.querySelectorAll("a,button,[role=button],li").length'
      ).catch(() => null);
      clearTimeout(timer);
      finish(
        {
          ok: true,
          url: win.webContents.getURL(),
          title: win.webContents.getTitle(),
          screenshot: outFile,
          interactiveNodes: cards,
          consoleMessages: consoleMessages.slice(0, 10),
        },
        0
      );
    } catch (error) {
      clearTimeout(timer);
      finish({ ok: false, reason: 'capture-failed', message: String(error && error.message) }, 1);
    }
  });
  trace('loadURL ' + target);
  win.loadURL(target);
}

app.whenReady().then(() => {
  trace('app ready');
  buildMenu();
  if (SMOKE) {
    runSmoke();
    return;
  }
  loadServer();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) loadServer();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
#!/usr/bin/env node
// scripts/open-index-shots.mjs
//
// Native Chrome DevTools Protocol screenshot + console/network verifier.
// No Playwright / Puppeteer: only Node builtins plus the "ws" dependency that
// already ships with this repo.
//
// CLI:
//   node scripts/open-index-shots.mjs --url <url> --out <dir>
//        [--sizes 390x844,1366x768] [--wait-for <css-selector>]
//        [--hash <hash>] [--timeout 30000]
//        [--browser <exe>] [--full-page] [--keep-profile] [--quiet]
//
// Exit codes:
//   0 = clean (no error-level console/exception/network issues)
//   1 = verification found at least one error-level issue (see summary.json)
//   2 = the tool itself failed (browser launch, CDP, navigation, screenshot)

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { WebSocket } from 'ws';

const DEFAULT_SIZES = '390x844,1366x768';
const DEFAULT_TIMEOUT = 30000;
const SETTLE_MS = 800;          // extra settle time after load for fonts/images
const POLL_MS = 100;
const CDP_CALL_TIMEOUT = 60000;

const CANDIDATE_BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------- CLI parsing

function parseArgs(argv) {
  const opts = {
    url: null, out: null, sizes: DEFAULT_SIZES, waitFor: null, hash: null,
    timeout: DEFAULT_TIMEOUT, browser: null, fullPage: false, keepProfile: false,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error('Missing value for ' + arg);
      i += 1;
      return value;
    };
    switch (arg) {
      case '--url': opts.url = next(); break;
      case '--out': opts.out = next(); break;
      case '--sizes': opts.sizes = next(); break;
      case '--wait-for': opts.waitFor = next(); break;
      case '--hash': opts.hash = next(); break;
      case '--timeout': opts.timeout = Number(next()); break;
      case '--browser': opts.browser = next(); break;
      case '--full-page': opts.fullPage = true; break;
      case '--keep-profile': opts.keepProfile = true; break;
      case '--quiet': opts.quiet = true; break;
      case '-h':
      case '--help': opts.help = true; break;
      default: throw new Error('Unknown argument: ' + arg);
    }
  }
  return opts;
}

const USAGE = [
  'Usage: node scripts/open-index-shots.mjs --url <url> --out <dir> [options]',
  '',
  '  --url <url>            page to load (required)',
  '  --out <dir>            output directory for PNGs + summary.json (required)',
  '  --sizes <list>         comma separated WxH, default ' + DEFAULT_SIZES,
  '  --wait-for <selector>  CSS selector (comma list ok) polled until it matches',
  '  --hash <hash>          force location hash, e.g. "#/orbital" or "/orbital"',
  '  --timeout <ms>         per-step budget, default ' + DEFAULT_TIMEOUT,
  '  --browser <exe>        explicit browser executable path',
  '  --full-page            captureBeyondViewport screenshot instead of the viewport',
  '  --keep-profile         keep the temporary user-data-dir (debugging)',
  '  --quiet                only print the summary block',
].join('\n');

function parseSizes(value) {
  const sizes = [];
  for (const raw of String(value).split(',')) {
    const token = raw.trim().toLowerCase();
    if (!token) continue;
    const match = token.match(/^(\d+)x(\d+)$/);
    if (!match) throw new Error('Bad size "' + raw + '", expected WxH e.g. 390x844');
    sizes.push({ width: Number(match[1]), height: Number(match[2]) });
  }
  if (!sizes.length) throw new Error('--sizes produced no valid entries');
  return sizes;
}

function normalizeUrl(rawUrl, rawHash) {
  const url = new URL(rawUrl);
  if (rawHash === null || rawHash === undefined || rawHash === '') return url.href;
  let hash = String(rawHash);
  if (!hash.startsWith('#')) hash = '#' + (hash.startsWith('/') ? hash : '/' + hash);
  url.hash = '';
  return url.href + hash;
}

// ------------------------------------------------------------- browser + port

function resolveBrowser(explicit) {
  const candidates = [explicit, process.env.OPEN_INDEX_BROWSER, ...CANDIDATE_BROWSERS];
  for (const candidate of candidates) {
    if (candidate && fss.existsSync(candidate)) return candidate;
  }
  throw new Error(
    'No browser found. Tried: ' + candidates.filter(Boolean).join(', ') +
    '\nPass --browser <path> or set OPEN_INDEX_BROWSER.'
  );
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function fetchJson(url, timeoutMs = 2000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForDevToolsEndpoint(port, deadline) {
  const endpoint = 'http://127.0.0.1:' + port + '/json/version';
  let lastError = 'no response';
  while (Date.now() < deadline) {
    const info = await fetchJson(endpoint);
    if (info && info.webSocketDebuggerUrl) return info;
    lastError = 'endpoint not ready';
    await sleep(150);
  }
  throw new Error('DevTools endpoint never became ready at ' + endpoint + ' (' + lastError + ')');
}

// -------------------------------------------------------------- CDP plumbing

class CDPClient {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    ws.on('message', (data) => {
      let message;
      try { message = JSON.parse(data.toString()); } catch { return; }
      if (message.id !== undefined) {
        const entry = this.pending.get(message.id);
        if (!entry) return;
        this.pending.delete(message.id);
        if (message.error) {
          const detail = message.error.data ? ' (' + message.error.data + ')' : '';
          entry.reject(new Error(message.error.message + detail));
        } else {
          entry.resolve(message.result);
        }
        return;
      }
      if (message.method) {
        for (const listener of this.listeners) listener(message);
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('CDP timeout after ' + CDP_CALL_TIMEOUT + 'ms: ' + method));
      }, CDP_CALL_TIMEOUT);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      this.ws.send(JSON.stringify(payload));
    });
  }

  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function connectWs(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { perMessageDeflate: false, maxPayload: 512 * 1024 * 1024 });
    const timer = setTimeout(() => {
      try { socket.terminate(); } catch { /* ignore */ }
      reject(new Error('WebSocket connect timeout: ' + url));
    }, timeoutMs);
    socket.on('open', () => { clearTimeout(timer); resolve(socket); });
    socket.on('error', (error) => { clearTimeout(timer); reject(error); });
  });
}

// ------------------------------------------------------------ event collection

function describeRemoteObject(arg) {
  if (!arg) return 'undefined';
  if (arg.type === 'string') return String(arg.value);
  if ('value' in arg && arg.value !== undefined) {
    if (arg.type === 'object') return arg.description || JSON.stringify(arg.value);
    return String(arg.value);
  }
  if (arg.unserializableValue !== undefined) return String(arg.unserializableValue);
  if (arg.description) return arg.description;
  if (arg.preview) {
    const head = arg.className || arg.subtype || 'Object';
    const body = (arg.preview.properties || []).map((p) => p.name + ': ' + p.value).join(', ');
    return head + '{' + body + '}';
  }
  return arg.type || 'unknown';
}

function describeLocation(item) {
  const url = item.url || '';
  if (!url) return '';
  const line = item.lineNumber !== undefined ? ':' + (item.lineNumber + 1) : '';
  const column = item.columnNumber !== undefined ? ':' + (item.columnNumber + 1) : '';
  return url + line + column;
}

// ------------------------------------------------------------------ the tool

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error('Argument error: ' + error.message);
    console.error(USAGE);
    process.exit(2);
  }
  if (opts.help) { console.log(USAGE); process.exit(0); }
  if (!opts.url) { console.error('Missing --url\n' + USAGE); process.exit(2); }
  if (!opts.out) { console.error('Missing --out\n' + USAGE); process.exit(2); }

  const startedAt = Date.now();
  const sizes = parseSizes(opts.sizes);
  const targetUrl = normalizeUrl(opts.url, opts.hash);
  const outDir = path.resolve(opts.out);
  await fs.mkdir(outDir, { recursive: true });

  const browserPath = resolveBrowser(opts.browser);
  const port = await freePort();
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'open-index-shots-'));
  const isWindows = process.platform === 'win32';

  const launchArgs = [
    '--headless=new',
    '--remote-debugging-port=' + port,
    '--remote-allow-origins=*',
    '--user-data-dir=' + profileDir,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--metrics-recording-only',
    '--mute-audio',
    '--hide-crash-restore-bubble',
    'about:blank',
  ];

  const issues = {
    consoleErrors: [],
    consoleWarnings: [],
    exceptions: [],
    logEntries: [],
    failedRequests: [],
    httpErrors: [],
    toolFailures: [],
  };
  const requests = new Map();
  const screenshots = [];

  let child = null;
  let cdp = null;
  let sessionId = null;
  let targetId = null;
  let exitCode = 0;

  const log = (...args) => { if (!opts.quiet) console.log(...args); };

  const record = (bucket, entry) => { issues[bucket].push(entry); };

  try {
    log('[shots] browser: ' + browserPath);
    log('[shots] url:     ' + targetUrl);
    log('[shots] out:     ' + outDir);

    child = spawn(browserPath, launchArgs, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stderrTail = '';
    child.stderr.on('data', (chunk) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-4000);
    });
    child.stdout.on('data', () => { /* drain */ });
    child.on('error', (error) => { record('toolFailures', { kind: 'spawn', message: error.message }); });

    const info = await waitForDevToolsEndpoint(port, Date.now() + 20000);
    const browserWs = await connectWs(info.webSocketDebuggerUrl);
    cdp = new CDPClient(browserWs);
    cdp.on((message) => {
      const session = message.sessionId;
      if (sessionId && session && session !== sessionId) return;
      const params = message.params || {};
      switch (message.method) {
        case 'Runtime.consoleAPICalled': {
          const text = (params.args || []).map(describeRemoteObject).join(' ');
          const entry = {
            level: params.type,
            text,
            at: new Date(params.timestamp).toISOString(),
            stack: (params.stackTrace && params.stackTrace.callFrames || [])
              .slice(0, 3).map((f) => f.functionName + ' @ ' + f.url + ':' + (f.lineNumber + 1)).join(' <- '),
          };
          if (params.type === 'error' || params.type === 'assert') record('consoleErrors', entry);
          else if (params.type === 'warning') record('consoleWarnings', entry);
          break;
        }
        case 'Runtime.exceptionThrown': {
          const details = params.exceptionDetails || {};
          record('exceptions', {
            text: details.text || '',
            description: (details.exception && details.exception.description) || '',
            url: details.url || '',
            line: (details.lineNumber || 0) + 1,
            column: (details.columnNumber || 0) + 1,
            stack: (details.stackTrace && details.stackTrace.callFrames || [])
              .slice(0, 4).map((f) => f.functionName + ' @ ' + f.url + ':' + (f.lineNumber + 1)).join(' <- '),
          });
          break;
        }
        case 'Log.entryAdded': {
          const entry = params.entry || {};
          const record0 = {
            level: entry.level,
            source: entry.source,
            text: entry.text,
            url: describeLocation(entry),
          };
          record('logEntries', record0);
          break;
        }
        case 'Network.requestWillBeSent': {
          if (params.request) requests.set(params.requestId, params.request.url);
          break;
        }
        case 'Network.responseReceived': {
          const response = params.response || {};
          if (response.status >= 400) {
            record('httpErrors', {
              status: response.status,
              statusText: response.statusText || '',
              url: response.url,
              type: params.type,
              mimeType: response.mimeType,
            });
          }
          break;
        }
        case 'Network.loadingFailed': {
          const url = requests.get(params.requestId) || '(unknown)';
          record('failedRequests', {
            url,
            errorText: params.errorText,
            type: params.type,
            canceled: Boolean(params.canceled),
          });
          break;
        }
        default: break;
      }
    });

    const created = await cdp.send('Target.createTarget', { url: 'about:blank' });
    targetId = created.targetId;
    const attached = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    sessionId = attached.sessionId;

    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Log.enable', {}, sessionId);
    await cdp.send('Network.enable', {}, sessionId);

    const evaluate = async (expression, awaitPromise = false) => {
      const result = await cdp.send('Runtime.evaluate', {
        expression, returnByValue: true, awaitPromise,
      }, sessionId);
      if (result.exceptionDetails) {
        throw new Error('evaluate failed: ' + (result.exceptionDetails.text || 'unknown'));
      }
      return result.result ? result.result.value : undefined;
    };

    for (const size of sizes) {
      const label = size.width + 'x' + size.height;
      const shotPath = path.join(outDir, label + '.png');
      const sizeStarted = Date.now();
      const entry = {
        label, width: size.width, height: size.height,
        screenshot: path.relative(process.cwd(), shotPath).split(path.sep).join('/'),
        screenshotAbsolute: shotPath, bytes: 0,
        loadMs: 0, waitForMs: 0, waitForFound: null, settleMs: SETTLE_MS,
        title: '', readyState: '', bodyTextLength: 0, scrollHeight: 0,
        analysis: null, issues: [],
      };

      // Fresh document per size so loadEventFired / readyState are deterministic.
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: size.width, height: size.height, deviceScaleFactor: 1, mobile: false,
      }, sessionId);
      await cdp.send('Page.navigate', { url: 'about:blank' }, sessionId);
      await sleep(120);

      const navStart = Date.now();
      await cdp.send('Page.navigate', { url: targetUrl }, sessionId);

      // Wait for document.readyState === "complete" (equivalent to the load event).
      let loaded = false;
      while (Date.now() - navStart < opts.timeout) {
        try {
          if (await evaluate('document.readyState') === 'complete') { loaded = true; break; }
        } catch { /* navigation in flight, retry */ }
        await sleep(POLL_MS);
      }
      entry.loadMs = Date.now() - navStart;
      if (!loaded) {
        entry.issues.push('load timeout after ' + opts.timeout + 'ms');
        record('toolFailures', { kind: 'load-timeout', size: label, url: targetUrl });
      }

      // Optional selector gate.
      if (opts.waitFor) {
        const waitStart = Date.now();
        let found = false;
        while (Date.now() - waitStart < opts.timeout) {
          try {
            const ok = await evaluate('!!document.querySelector(' + JSON.stringify(opts.waitFor) + ')');
            if (ok) { found = true; break; }
          } catch { /* retry */ }
          await sleep(POLL_MS);
        }
        entry.waitForMs = Date.now() - waitStart;
        entry.waitForFound = found;
        if (!found) {
          entry.issues.push('--wait-for selector never matched: ' + opts.waitFor);
          record('toolFailures', { kind: 'wait-for-timeout', size: label, selector: opts.waitFor });
        }
      }

      await sleep(SETTLE_MS);

      try {
        entry.title = await evaluate('document.title');
        entry.readyState = await evaluate('document.readyState');
        entry.bodyTextLength = await evaluate('(document.body&&document.body.innerText||"").trim().length');
        entry.scrollHeight = await evaluate('Math.max(document.documentElement.scrollHeight, document.body?document.body.scrollHeight:0)');
        entry.elementCount = await evaluate('document.querySelectorAll("*").length');
      } catch (error) {
        entry.issues.push('probe failed: ' + error.message);
      }

      const shot = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: opts.fullPage,
      }, sessionId);
      const buffer = Buffer.from(shot.data, 'base64');
      await fs.writeFile(shotPath, buffer);
      entry.bytes = buffer.length;

      // Cheap blank/white-screen detector: decode the PNG inside the page with a
      // canvas and sample pixels. No extra npm dependency needed.
      if (buffer.length < 12 * 1024 * 1024) {
        try {
          const probe = '(async()=>{'
            + 'const img=new Image();img.src="data:image/png;base64,' + shot.data + '";'
            + 'await img.decode();'
            + 'const c=document.createElement("canvas");c.width=img.width;c.height=img.height;'
            + 'const x=c.getContext("2d");x.drawImage(img,0,0);'
            + 'const d=x.getImageData(0,0,c.width,c.height).data;'
            + 'let n=0,sum=0;const buckets=new Map();'
            + 'for(let i=0;i<d.length;i+=4*53){'
            + 'const r=d[i],g=d[i+1],b=d[i+2];'
            + 'sum+=(0.2126*r+0.7152*g+0.0722*b);n++;'
            + 'const k=(r>>4)+","+(g>>4)+","+(b>>4);buckets.set(k,(buckets.get(k)||0)+1);}'
            + 'let top=0;for(const v of buckets.values())if(v>top)top=v;'
            + 'return{meanLuma:+(sum/n).toFixed(2),sampled:n,distinctColors:buckets.size,dominantShare:+(top/n).toFixed(4)};'
            + '})()';
          entry.analysis = await evaluate(probe, true);
        } catch (error) {
          entry.issues.push('pixel analysis failed: ' + error.message);
        }
      }

      entry.durationMs = Date.now() - sizeStarted;
      screenshots.push(entry);
      log('[shots] ' + label + ' -> ' + shotPath + ' (' + buffer.length + ' bytes, load ' + entry.loadMs + 'ms'
        + (opts.waitFor ? ', wait-for ' + (entry.waitForFound ? 'ok' : 'TIMEOUT') + ' ' + entry.waitForMs + 'ms' : '')
        + ', text ' + entry.bodyTextLength + ' chars)');
    }
  } catch (error) {
    issues.toolFailures.push({ kind: 'fatal', message: error.message });
    console.error('[shots] FATAL: ' + error.message);
  } finally {
    // Teardown: ask the browser to close, then make sure the process tree is gone.
    try {
      if (cdp && targetId) await cdp.send('Target.closeTarget', { targetId });
    } catch { /* ignore */ }
    try {
      if (cdp) await cdp.send('Browser.close');
    } catch { /* ignore */ }
    try { if (cdp) cdp.ws.close(); } catch { /* ignore */ }

    if (child && child.pid) {
      const deadline = Date.now() + 5000;
      while (child.exitCode === null && Date.now() < deadline) await sleep(100);
      if (child.exitCode === null) {
        if (isWindows) {
          try { spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { /* ignore */ }
        } else {
          try { child.kill('SIGKILL'); } catch { /* ignore */ }
        }
        await sleep(300);
      }
    }

    if (!opts.keepProfile) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try { await fs.rm(profileDir, { recursive: true, force: true }); break; }
        catch { await sleep(300); }
      }
    }
  }

  // --------------------------------------------------------------- reporting

  const isAbort = (item) => /ERR_ABORTED/i.test(item.errorText || '') || item.canceled === true;
  const hardFailures = issues.failedRequests.filter((item) => !isAbort(item));
  const softFailures = issues.failedRequests.filter(isAbort);
  const errorLevelLogs = issues.logEntries.filter((item) => item.level === 'error');
  const warningLevelLogs = issues.logEntries.filter((item) => item.level === 'warning');
  const waitForTimeouts = issues.toolFailures.filter((item) => item.kind === 'wait-for-timeout' || item.kind === 'load-timeout');
  const fatalFailures = issues.toolFailures.filter((item) => item.kind === 'fatal' || item.kind === 'spawn');

  const errorCount = issues.consoleErrors.length + issues.exceptions.length
    + errorLevelLogs.length + hardFailures.length + issues.httpErrors.length
    + waitForTimeouts.length;
  const warningCount = issues.consoleWarnings.length + warningLevelLogs.length + softFailures.length;
  const toolFailed = fatalFailures.length > 0;

  const summary = {
    tool: 'scripts/open-index-shots.mjs',
    generatedAt: new Date().toISOString(),
    url: targetUrl,
    requestedUrl: opts.url,
    hash: opts.hash,
    waitFor: opts.waitFor,
    fullPage: opts.fullPage,
    browser: browserPath,
    devtoolsPort: port,
    durationMs: Date.now() - startedAt,
    screenshots,
    counts: {
      screenshots: screenshots.length,
      consoleErrors: issues.consoleErrors.length,
      consoleWarnings: issues.consoleWarnings.length,
      exceptions: issues.exceptions.length,
      logEntries: issues.logEntries.length,
      logErrors: errorLevelLogs.length,
      logWarnings: warningLevelLogs.length,
      failedRequests: issues.failedRequests.length,
      failedRequestsHard: hardFailures.length,
      failedRequestsAborted: softFailures.length,
      httpErrors: issues.httpErrors.length,
      toolFailures: issues.toolFailures.length,
      errors: errorCount,
      warnings: warningCount,
    },
    issues: {
      consoleErrors: issues.consoleErrors,
      consoleWarnings: issues.consoleWarnings,
      exceptions: issues.exceptions,
      logEntries: issues.logEntries,
      failedRequests: issues.failedRequests,
      httpErrors: issues.httpErrors,
      toolFailures: issues.toolFailures,
    },
  };

  const summaryPath = path.join(outDir, 'summary.json');
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');

  console.log('');
  console.log('=== open-index-shots summary ===');
  console.log('url:    ' + targetUrl);
  console.log('out:    ' + outDir);
  console.log('time:   ' + summary.durationMs + 'ms');
  for (const shot of screenshots) {
    const blank = shot.analysis && shot.analysis.dominantShare > 0.985 ? '  <-- LOOKS BLANK' : '';
    console.log('shot:   ' + shot.label + '  ' + shot.bytes + ' bytes  text=' + shot.bodyTextLength
      + '  distinctColors=' + (shot.analysis ? shot.analysis.distinctColors : 'n/a')
      + '  meanLuma=' + (shot.analysis ? shot.analysis.meanLuma : 'n/a') + blank);
  }
  console.log('errors: ' + errorCount + '   warnings: ' + warningCount);

  const dump = (title, list, format) => {
    if (!list.length) return;
    console.log('');
    console.log('--- ' + title + ' (' + list.length + ') ---');
    for (const item of list) console.log('  ' + format(item));
  };
  dump('console.error / assert', issues.consoleErrors, (i) => '[' + i.level + '] ' + i.text + (i.stack ? '  @ ' + i.stack : ''));
  dump('uncaught exceptions', issues.exceptions, (i) => i.text + ' ' + i.description + '  @ ' + i.url + ':' + i.line);
  dump('log error entries', errorLevelLogs, (i) => '[' + i.source + '] ' + i.text + '  @ ' + i.url);
  dump('http 4xx/5xx', issues.httpErrors, (i) => i.status + ' ' + i.statusText + ' ' + i.url);
  dump('failed requests', hardFailures, (i) => i.errorText + '  ' + i.url);
  dump('console.warn', issues.consoleWarnings, (i) => i.text);
  dump('log warning entries', warningLevelLogs, (i) => '[' + i.source + '] ' + i.text + '  @ ' + i.url);
  dump('aborted requests (informational)', softFailures, (i) => i.errorText + '  ' + i.url);
  dump('tool failures', issues.toolFailures, (i) => JSON.stringify(i));
  console.log('');
  console.log('summary: ' + summaryPath);

  if (toolFailed) exitCode = 2;
  else if (errorCount > 0) exitCode = 1;
  process.exit(exitCode);
}

main().catch((error) => {
  console.error('[shots] unhandled failure: ' + (error && error.stack || error));
  process.exit(2);
});

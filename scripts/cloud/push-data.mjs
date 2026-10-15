#!/usr/bin/env node
/**
 * 把本机数据包推到阿里云 ECS 并（可选）在远端跑导入。
 *
 * 流程：本地校验 → 打成 tar.gz → scp 上传 → 远端解到 deploy/import → 在 app 容器里跑 import-data.mjs → --check 复核。
 *
 * 设计取舍：
 * 1) 打包用自带的纯 Node tar（scripts/cloud/lib/tar.mjs），不依赖 Windows 上的 tar.exe；
 * 2) 远端解包前先 rm -rf deploy/import —— 数据包是「当前真相」，残留旧文件只会让故障难查；
 *    这个目录里只放上传的数据包，删它是安全的（脚本会在动手前把命令打印出来）；
 * 3) 默认 BatchMode=yes（不弹密码）与 StrictHostKeyChecking=accept-new，方便第一次连接不卡在 yes/no 上；
 *    用密码登录就加 --password-auth；
 * 4) 所有 ssh/scp 命令都先构造、后执行，--dry-run 只打印不执行，便于没有 ECS 时自检。
 *
 * 用法：
 *   node scripts/cloud/push-data.mjs --host 47.98.1.2                # 上传 + 导入 + 复核
 *   node scripts/cloud/push-data.mjs --host 47.98.1.2 --dry-run      # 只打印将执行的命令
 *   node scripts/cloud/push-data.mjs --host 47.98.1.2 --check        # 只看云端现状（只读）
 *   node scripts/cloud/push-data.mjs --skip-upload                   # 只校验 + 打包
 *
 * 注意（PowerShell 5.1）：npm run cloud:push 后面不要用裸 -- 传参，会被吞掉；
 * 直接 node scripts/cloud/push-data.mjs --host x，或 npm run cloud:push "--" "--host" "x"。
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyDataPackage, readManifest, formatBytes, resolveInPackage, toPosixPath } from './lib/package-io.mjs';
import { packTarGz } from './lib/tar.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

export const DEFAULTS = {
  user: 'root',
  port: 22,
  remoteDir: '/srv/hengbeger',
  packageDir: path.join(REPO_ROOT, 'deploy', 'import'),
  tarPath: path.join(REPO_ROOT, 'deploy', 'packages', 'hengbeger-package.tar.gz'),
  ssh: 'ssh',
  scp: 'scp',
  composeFile: 'deploy/docker-compose.yml',
  tarName: 'hengbeger-package.tar.gz',
};

// 单引号包住一段要交给远端 shell 的文本。
export function sq(value) {
  return "'" + String(value).split("'").join("'\\''") + "'";
}

// 远端脚本：换行分隔的多行命令，整体作为 ssh 的一个 argv 参数。
export function remoteScript(lines) {
  return lines.join('\n');
}

export function sshArgs(options, target, command) {
  const args = ['-T', '-p', String(options.port), '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=15',
    '-o', 'StrictHostKeyChecking=accept-new'];
  if (!options.passwordAuth) args.push('-o', 'BatchMode=yes');
  if (options.key) args.push('-i', options.key);
  args.push(target, command);
  return args;
}

export function scpArgs(options, source, target) {
  // scp 的端口参数是大写 -P，和 ssh 不一样。
  const args = ['-p', '-P', String(options.port), '-o', 'ConnectTimeout=15', '-o', 'StrictHostKeyChecking=accept-new'];
  if (!options.passwordAuth) args.push('-o', 'BatchMode=yes');
  if (options.key) args.push('-i', options.key);
  args.push(source, target);
  return args;
}

export function buildSteps(options, tarPath) {
  const target = options.user + '@' + options.host;
  const repo = options.remoteDir;
  const incoming = repo + '/incoming';
  const remoteTar = 'incoming/' + options.tarName;
  const compose = 'docker compose -f ' + options.composeFile;
  const importArgs = 'node scripts/cloud/import-data.mjs --dir /import';

  const mkdir = remoteScript(['set -e', 'mkdir -p ' + sq(incoming) + ' ' + sq(repo + '/deploy')]);
  const extract = remoteScript([
    'set -e',
    'cd ' + sq(repo),
    'rm -rf deploy/import',
    'mkdir -p deploy/import',
    'tar -xzf ' + sq(remoteTar) + ' -C deploy/import',
    'du -sh deploy/import',
    'ls -1 deploy/import',
  ]);
  // 坑：compose 的 `./import:/import:ro` 绑定挂载只在**容器创建时**解析源目录。
  // 首次 up 时 deploy/import 还不存在的话，容器里 /import 会永远是个空目录（Docker 不会自愈），
  // 导入就会报「没有找到 manifest.json」。所以每次导入前都重建一次 app 容器。
  const runImport = remoteScript(['set -e', 'cd ' + sq(repo), compose + ' ps', compose + ' up -d --force-recreate app', compose + ' exec -T app ' + importArgs]);
  const runCheck = remoteScript(['set -e', 'cd ' + sq(repo), compose + ' exec -T app ' + importArgs + ' --check']);

  return [
    { label: '准备远端目录', bin: options.ssh, args: sshArgs(options, target, mkdir) },
    { label: '上传数据包 (scp)', bin: options.scp, args: scpArgs(options, tarPath, target + ':' + incoming + '/' + options.tarName) },
    { label: '远端解包到 deploy/import', bin: options.ssh, args: sshArgs(options, target, extract) },
    { label: '远端导入（app 容器内 import-data.mjs）', bin: options.ssh, args: sshArgs(options, target, runImport) },
    { label: '远端复核（--check，只读）', bin: options.ssh, args: sshArgs(options, target, runCheck) },
  ];
}

// 按 manifest 列出的内容收集待打包文件，顺序固定（manifest → entries → tables → images），便于复现。
export function collectPackageFiles(dir, manifest) {
  const files = ['manifest.json'];
  if (manifest?.data?.entries?.file) files.push(toPosixPath(manifest.data.entries.file));
  for (const [name, info] of Object.entries(manifest?.data?.tables || {})) {
    files.push(toPosixPath(info?.file || 'tables/' + name + '.jsonl'));
  }
  for (const tier of ['thumbs', 'displays']) {
    const info = manifest?.images?.[tier];
    if (!info?.dir) continue;
    const tierDir = resolveInPackage(dir, info.dir);
    if (!fs.existsSync(tierDir)) continue;
    for (const name of fs.readdirSync(tierDir).sort()) {
      if (name.endsWith(info.suffix || '.webp')) files.push(toPosixPath(info.dir + '/' + name));
    }
  }
  return files;
}

// 图片不归 verifyDataPackage 管（那个只管 entries 与 tables），这里按 manifest 的张数与字节数对一遍。
export function verifyImages(dir, manifest) {
  const problems = [];
  for (const tier of ['thumbs', 'displays']) {
    const info = manifest?.images?.[tier];
    if (!info?.dir) continue;
    const tierDir = resolveInPackage(dir, info.dir);
    if (!fs.existsSync(tierDir)) {
      problems.push('缺少图片目录 ' + toPosixPath(info.dir));
      continue;
    }
    const names = fs.readdirSync(tierDir).filter((name) => name.endsWith(info.suffix || '.webp'));
    let bytes = 0;
    for (const name of names) bytes += fs.statSync(path.join(tierDir, name)).size;
    if (Number.isFinite(info.count) && names.length !== info.count) {
      problems.push(toPosixPath(info.dir) + ' 张数不符：manifest ' + info.count + '，实际 ' + names.length);
    }
    if (Number.isFinite(info.bytes) && bytes !== info.bytes) {
      problems.push(toPosixPath(info.dir) + ' 字节数不符：manifest ' + info.bytes + '，实际 ' + bytes);
    }
  }
  return problems;
}

export function spawnRunner(bin, args) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: 'inherit', shell: false });
    child.on('error', (error) => resolve({ code: 127, error }));
    child.on('close', (code, signal) => resolve({ code: code === null ? 1 : code, signal }));
  });
}

export async function runPush(options, deps = {}) {
  const runner = deps.runner || spawnRunner;
  const log = deps.log || ((line) => console.log(line));
  const packer = deps.packer || packTarGz;
  const steps = [];

  log('数据包目录：' + path.resolve(options.packageDir));
  const verified = verifyDataPackage(options.packageDir);
  if (!verified.ok) {
    log('[失败] 本地数据包校验不通过（先跑 npm run cloud:export 与 npm run cloud:images）：');
    for (const problem of verified.problems) log('  - ' + problem);
    return { ok: false, reason: 'package-invalid', problems: verified.problems, steps };
  }
  const manifest = verified.manifest || readManifest(options.packageDir);
  const entries = manifest?.data?.entries || {};
  log('条目：' + entries.count + ' 条（' + formatBytes(entries.bytes) + '），导出时间 ' + manifest?.exportedAt);

  const imageProblems = verifyImages(options.packageDir, manifest);
  if (imageProblems.length) {
    log('[失败] 图片产物与 manifest 不符（先跑 npm run cloud:images）：');
    for (const problem of imageProblems) log('  - ' + problem);
    return { ok: false, reason: 'images-invalid', problems: imageProblems, steps };
  }
  const thumbs = manifest?.images?.thumbs || {};
  const displays = manifest?.images?.displays || {};
  log('图片：缩略图 ' + thumbs.count + ' 张（' + formatBytes(thumbs.bytes) + '），显示图 ' + displays.count + ' 张（' + formatBytes(displays.bytes) + '）');

  const remote = { ...options, tarName: options.tarName || DEFAULTS.tarName };

  if (options.checkOnly) {
    const checkOnly = buildSteps(remote, options.tarPath).filter((step) => step.label.startsWith('远端复核'));
    if (options.dryRun) {
      log('[dry-run] 将要执行的命令：');
      for (const step of checkOnly) log('  ' + step.bin + ' ' + step.args.map(quoteForDisplay).join(' '));
      return { ok: true, dryRun: true, steps: checkOnly };
    }
    for (const step of checkOnly) {
      log('== ' + step.label + ' ==');
      const result = await runner(step.bin, step.args, step.label);
      if (result.code !== 0) {
        log('[失败] ' + step.label + ' 退出码 ' + result.code);
        return { ok: false, reason: 'command-failed', failedStep: step.label, steps: checkOnly };
      }
    }
    return { ok: true, steps: checkOnly };
  }

  const files = collectPackageFiles(options.packageDir, manifest);
  // manifest.data.totalBytes 只算条目与小表（阶段 1 留下的字段），这里要把两档图片也加进来。
  const tableBytes = Object.values(manifest?.data?.tables || {}).reduce((sum, info) => sum + (Number(info?.bytes) || 0), 0);
  const totalBytes = (Number(entries.bytes) || 0) + tableBytes +
    (Number(thumbs.bytes) || 0) + (Number(displays.bytes) || 0);

  if (options.dryRun) {
    // dry-run 不做任何事：不打包、不连接。等真跑的时候再花那 20 秒。
    steps.push(...buildSteps(remote, options.tarPath));
    if (options.skipImport) steps.splice(3, 2);
    log('将打包 ' + files.length + ' 个文件（未压缩约 ' + formatBytes(totalBytes) + '）→ ' + options.tarPath);
    log('[dry-run] 将要执行的命令（不会真的跑）：');
    for (const step of steps) log('  [' + step.label + '] ' + step.bin + ' ' + step.args.map(quoteForDisplay).join(' '));
    return { ok: true, dryRun: true, steps };
  }

  log('打包中：' + files.length + ' 个文件 → ' + options.tarPath);
  // tar 里的 mtime 固定用 manifest.exportedAt：同一个数据包永远打出同一个 sha256，方便比对与复现。
  const exportedAtMs = Date.parse(manifest?.exportedAt || '');
  const packed = await packer({
    dir: options.packageDir,
    files,
    out: options.tarPath,
    mtimeSeconds: Number.isFinite(exportedAtMs) ? Math.floor(exportedAtMs / 1000) : undefined,
    onProgress: (done, total) => log('  ... ' + done + '/' + total),
  });
  log('打包完成：' + formatBytes(packed.bytes) + '，sha256 ' + packed.sha256.slice(0, 16) + '…');

  if (options.skipUpload) {
    log('[完成] 只校验并打包，未上传（--skip-upload）。');
    return { ok: true, packed, steps };
  }

  steps.push(...buildSteps(remote, options.tarPath));
  if (options.skipImport) steps.splice(3, 2); // 去掉导入与复核两步

  for (const step of steps) {
    log('');
    log('== ' + step.label + ' ==');
    const result = await runner(step.bin, step.args, step.label);
    if (result.code !== 0) {
      log('[失败] ' + step.label + ' 退出码 ' + result.code + '（前面的步骤已经生效）');
      return { ok: false, reason: 'command-failed', failedStep: step.label, packed, steps };
    }
  }
  log('');
  log('[完成] 数据已推到 ' + remote.user + '@' + remote.host + ':' + remote.remoteDir +
    '；file 模式的图片清单缓存 60 秒，稍等一会儿 App 就能看到新图。');
  return { ok: true, packed, steps };
}

function quoteForDisplay(value) {
  const text = String(value);
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(text) ? text : JSON.stringify(text);
}

export function parseArgs(argv) {
  const options = {
    host: process.env.HENGBERGER_CLOUD_HOST || '',
    user: process.env.HENGBERGER_CLOUD_USER || DEFAULTS.user,
    port: Number(process.env.HENGBERGER_CLOUD_PORT || DEFAULTS.port),
    remoteDir: process.env.HENGBERGER_CLOUD_DIR || DEFAULTS.remoteDir,
    key: process.env.HENGBERGER_CLOUD_KEY || '',
    packageDir: DEFAULTS.packageDir,
    tarPath: DEFAULTS.tarPath,
    ssh: process.env.HENGBERGER_SSH_BIN || DEFAULTS.ssh,
    scp: process.env.HENGBERGER_SCP_BIN || DEFAULTS.scp,
    composeFile: DEFAULTS.composeFile,
    tarName: DEFAULTS.tarName,
    passwordAuth: false,
    dryRun: false,
    checkOnly: false,
    skipUpload: false,
    skipImport: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(arg + ' 需要一个值');
      i += 1;
      return value;
    };
    switch (arg) {
      case '--host': options.host = next(); break;
      case '--user': options.user = next(); break;
      case '--port': options.port = Number(next()); break;
      case '--key': options.key = next(); break;
      case '--dir': options.remoteDir = next(); break;
      case '--package': options.packageDir = path.resolve(next()); break;
      case '--tar': options.tarPath = path.resolve(next()); break;
      case '--ssh': options.ssh = next(); break;
      case '--scp': options.scp = next(); break;
      case '--password-auth': options.passwordAuth = true; break;
      case '--dry-run': options.dryRun = true; break;
      case '--check': options.checkOnly = true; break;
      case '--skip-upload': options.skipUpload = true; break;
      case '--skip-import': options.skipImport = true; break;
      case '-h': case '--help': options.help = true; break;
      default: throw new Error('未知参数：' + arg);
    }
  }
  return options;
}

function printHelp() {
  console.log([
    '用法：node scripts/cloud/push-data.mjs --host <ECS公网IP> [选项]',
    '',
    '选项：',
    '  --host <ip>        ECS 公网 IP（也可用环境变量 HENGBERGER_CLOUD_HOST）',
    '  --user <name>      SSH 用户（默认 root）',
    '  --port <n>         SSH 端口（默认 22）',
    '  --key <path>       SSH 私钥（-i）',
    '  --dir <path>       云端仓库目录（默认 /srv/hengbeger）',
    '  --package <dir>    本地数据包目录（默认 deploy/import）',
    '  --tar <path>       中间 tar.gz 路径（默认 deploy/packages/hengbeger-package.tar.gz）',
    '  --ssh/--scp <cmd>  指定 ssh/scp 可执行文件',
    '  --password-auth    允许交互输入密码（默认 BatchMode=yes，只走密钥/agent）',
    '  --check            只做远端 --check（只读，不上传不导入）',
    '  --skip-upload      只校验 + 打包',
    '  --skip-import      上传与解包，但不跑远端导入',
    '  --dry-run          只打印将执行的命令',
    '  -h, --help         显示本帮助',
  ].join('\n'));
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error('[失败] ' + error.message);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.host && !options.skipUpload) {
    console.error('[失败] 缺少 --host（ECS 公网 IP）。先用 --dry-run 加一个假 IP 可以看命令长什么样。');
    process.exitCode = 2;
    return;
  }
  if (!Number.isFinite(options.port) || options.port <= 0) {
    console.error('[失败] 端口不合法：' + options.port);
    process.exitCode = 2;
    return;
  }
  const result = await runPush(options);
  process.exitCode = result.ok ? 0 : 1;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error('[失败] ' + (error && error.stack ? error.stack : error));
    process.exitCode = 1;
  });
}

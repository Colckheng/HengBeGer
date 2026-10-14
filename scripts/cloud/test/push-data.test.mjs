import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  DEFAULTS, buildSteps, collectPackageFiles, parseArgs, remoteScript, runPush, sq, verifyImages,
} from '../push-data.mjs';
import { sha256Text } from '../lib/package-io.mjs';
import { packTarGz } from '../lib/tar.mjs';

// 造一个「能过 verifyDataPackage」的最小数据包。
async function makePackage() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'hb-pkg-'));
  await fsp.mkdir(path.join(dir, 'tables'), { recursive: true });
  await fsp.mkdir(path.join(dir, 'images', 't'), { recursive: true });
  await fsp.mkdir(path.join(dir, 'images', 'd'), { recursive: true });
  const entries = JSON.stringify({ entry_key: 'a', content_hash: 'h' }) + '\n';
  const tableA = '{"id":1,"name":"x"}\n';
  await fsp.writeFile(path.join(dir, 'entries.jsonl'), entries, 'utf8');
  await fsp.writeFile(path.join(dir, 'tables', 'a.jsonl'), tableA, 'utf8');
  await fsp.writeFile(path.join(dir, 'images', 't', 'aa.webp'), Buffer.alloc(10, 1));
  await fsp.writeFile(path.join(dir, 'images', 'd', 'aa.webp'), Buffer.alloc(20, 2));
  const manifest = {
    formatVersion: 1,
    exportedAt: '2026-10-14T12:00:00.000Z',
    data: {
      entries: { file: 'entries.jsonl', count: 1, bytes: Buffer.byteLength(entries), sha256: sha256Text(entries) },
      tables: { a: { file: 'tables/a.jsonl', count: 1, bytes: Buffer.byteLength(tableA), sha256: sha256Text(tableA) } },
    },
    images: {
      thumbs: { dir: 'images/t', suffix: '.webp', count: 1, bytes: 10 },
      displays: { dir: 'images/d', suffix: '.webp', count: 1, bytes: 20 },
    },
  };
  await fsp.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest), 'utf8');
  return dir;
}

function baseOptions(packageDir) {
  return { ...DEFAULTS, host: '47.98.1.2', packageDir, tarPath: path.join(path.dirname(packageDir), 'out.tar.gz') };
}

function recorder() {
  const calls = [];
  return {
    calls,
    runner: async (bin, args, label) => { calls.push({ bin, args, label }); return { code: 0 }; },
  };
}

test('sq：单引号被正确转义', () => {
  assert.equal(sq('/opt/hengbeger'), "'/opt/hengbeger'");
  assert.equal(sq("it's"), "'it'\\''s'");
});

test('buildSteps：ssh 用 -p，scp 用 -P，默认加 BatchMode', () => {
  const options = baseOptions('/tmp/pkg');
  const steps = buildSteps(options, '/tmp/pkg.tar.gz');
  assert.equal(steps.length, 5);
  const [mkdir, scp, extract, importStep, check] = steps;
  assert.equal(mkdir.bin, 'ssh');
  assert.ok(mkdir.args.includes('-p') && mkdir.args.includes('22'));
  assert.ok(mkdir.args.includes('BatchMode=yes'));
  assert.ok(mkdir.args.includes('root@47.98.1.2'));
  assert.equal(scp.bin, 'scp');
  assert.ok(scp.args.includes('-P'), 'scp 必须用大写 -P 传端口');
  assert.ok(!scp.args.includes('-p') || scp.args[0] === '-p', 'scp 的小写 -p 只能是「保留时间戳」的第一位');
  assert.ok(scp.args[scp.args.length - 1].startsWith('root@47.98.1.2:' + DEFAULTS.remoteDir + '/incoming/'));
  assert.match(extract.args[extract.args.length - 1], /rm -rf deploy\/import/);
  assert.match(extract.args[extract.args.length - 1], /tar -xzf 'incoming\/hengbeger-package\.tar\.gz' -C deploy\/import/);
  assert.match(importStep.args[importStep.args.length - 1], /docker compose -f deploy\/docker-compose\.yml exec -T app node scripts\/cloud\/import-data\.mjs --dir \/import/);
  assert.match(check.args[check.args.length - 1], /--check/);
});

test('buildSteps：--password-auth 时不加 BatchMode，--key 传 -i', () => {
  const options = { ...baseOptions('/tmp/pkg'), passwordAuth: true, key: '/home/u/.ssh/id_ed25519', port: 2222 };
  const [mkdir, scp] = buildSteps(options, '/tmp/pkg.tar.gz');
  assert.ok(!mkdir.args.includes('BatchMode=yes'));
  assert.ok(mkdir.args.includes('-i') && mkdir.args.includes('/home/u/.ssh/id_ed25519'));
  assert.equal(mkdir.args[mkdir.args.indexOf('-p') + 1], '2222');
  assert.equal(scp.args[scp.args.indexOf('-P') + 1], '2222');
});

test('collectPackageFiles：顺序固定且包含两档图片', async () => {
  const dir = await makePackage();
  try {
    const files = collectPackageFiles(dir, JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')));
    assert.deepEqual(files, ['manifest.json', 'entries.jsonl', 'tables/a.jsonl', 'images/t/aa.webp', 'images/d/aa.webp']);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('verifyImages：张数或字节数不符要报出来', async () => {
  const dir = await makePackage();
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    assert.deepEqual(verifyImages(dir, manifest), []);
    manifest.images.thumbs.count = 2;
    assert.match(verifyImages(dir, manifest)[0], /张数不符/);
    manifest.images.thumbs.count = 1;
    manifest.images.displays.bytes = 999;
    assert.match(verifyImages(dir, manifest)[0], /字节数不符/);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('runPush：包不完整时立刻失败，不执行任何命令', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'hb-empty-'));
  const { calls, runner } = recorder();
  const lines = [];
  try {
    const result = await runPush(baseOptions(dir), { runner, log: (line) => lines.push(line) });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'package-invalid');
    assert.equal(calls.length, 0);
    assert.ok(lines.some((line) => line.includes('缺少 manifest.json')));
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('runPush：dry-run 只打印命令，不打包也不执行命令', async () => {
  const dir = await makePackage();
  const { calls, runner } = recorder();
  const lines = [];
  let packed = 0;
  try {
    const result = await runPush({ ...baseOptions(dir), dryRun: true }, {
      runner,
      log: (line) => lines.push(line),
      packer: async () => { packed += 1; return { bytes: 1, sha256: 'x'.repeat(64), fileCount: 5 }; },
    });
    assert.equal(result.ok, true);
    assert.equal(result.dryRun, true);
    assert.equal(calls.length, 0);
    assert.equal(packed, 0, 'dry-run 不应该真的打包');
    assert.ok(lines.some((line) => line.includes('将打包 5 个文件')));
    assert.ok(lines.some((line) => line.includes('scp')));
    assert.ok(lines.some((line) => line.includes('import-data.mjs')));
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('runPush：正常路径按顺序跑 5 步', async () => {
  const dir = await makePackage();
  const { calls, runner } = recorder();
  const lines = [];
  try {
    const result = await runPush(baseOptions(dir), {
      runner,
      log: (line) => lines.push(line),
      packer: async () => ({ bytes: 123, sha256: 'a'.repeat(64), fileCount: 5 }),
    });
    assert.equal(result.ok, true);
    assert.deepEqual(calls.map((call) => call.label), ['准备远端目录', '上传数据包 (scp)', '远端解包到 deploy/import', '远端导入（app 容器内 import-data.mjs）', '远端复核（--check，只读）']);
    assert.equal(calls[1].bin, 'scp');
    assert.ok(lines.some((line) => line.includes('[完成] 数据已推到 root@47.98.1.2:' + DEFAULTS.remoteDir)));
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('runPush：导入失败就地停下，不再跑复核', async () => {
  const dir = await makePackage();
  const calls = [];
  const lines = [];
  try {
    const result = await runPush(baseOptions(dir), {
      log: (line) => lines.push(line),
      packer: async () => ({ bytes: 1, sha256: 'b'.repeat(64), fileCount: 5 }),
      runner: async (bin, args, label) => {
        calls.push(label);
        return { code: label.includes('远端导入') ? 1 : 0 };
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.failedStep, '远端导入（app 容器内 import-data.mjs）');
    assert.equal(calls.length, 4, '复核步骤不应被执行');
    assert.ok(lines.some((line) => line.includes('前面的步骤已经生效')));
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('runPush：打包用的 mtime 固定取自 manifest.exportedAt（可复现）', async () => {
  const dir = await makePackage();
  const seen = [];
  try {
    await runPush({ ...baseOptions(dir), skipUpload: true }, {
      log: () => {},
      packer: async (options) => { seen.push(options.mtimeSeconds); return { bytes: 1, sha256: 'd'.repeat(64), fileCount: 5 }; },
    });
    assert.equal(seen.length, 1);
    assert.equal(seen[0], Math.floor(Date.parse('2026-10-14T12:00:00.000Z') / 1000));
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('runPush：--skip-upload 只校验并打包', async () => {
  const dir = await makePackage();
  const { calls, runner } = recorder();
  try {
    const result = await runPush({ ...baseOptions(dir), skipUpload: true }, {
      runner,
      log: () => {},
      packer: async () => ({ bytes: 1, sha256: 'c'.repeat(64), fileCount: 5 }),
    });
    assert.equal(result.ok, true);
    assert.equal(calls.length, 0);
    assert.equal(result.packed.fileCount, 5);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('runPush：--check 只跑只读复核一步', async () => {
  const dir = await makePackage();
  const { calls, runner } = recorder();
  try {
    const result = await runPush({ ...baseOptions(dir), checkOnly: true }, { runner, log: () => {} });
    assert.equal(result.ok, true);
    assert.deepEqual(calls.map((call) => call.label), ['远端复核（--check，只读）']);
    assert.ok(calls[0].args[calls[0].args.length - 1].endsWith('--check'));
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('parseArgs：环境变量兜底、标志位与错误参数', () => {
  const options = parseArgs(['--host', '1.2.3.4', '--port', '2222', '--dry-run', '--password-auth', '--check']);
  assert.equal(options.host, '1.2.3.4');
  assert.equal(options.port, 2222);
  assert.equal(options.dryRun, true);
  assert.equal(options.passwordAuth, true);
  assert.equal(options.checkOnly, true);
  assert.equal(options.user, 'root');
  assert.throws(() => parseArgs(['--nope']), /未知参数/);
  assert.throws(() => parseArgs(['--host']), /需要一个值/);
});

test('remoteScript：多行命令原样保留', () => {
  assert.equal(remoteScript(['set -e', 'cd /opt']), 'set -e\ncd /opt');
});

test('buildSteps 的「远端解包」命令能在真实 shell 里跑通（有 bash 才测）', async (t) => {
  try {
    execFileSync('bash', ['--version'], { stdio: 'pipe' });
  } catch (error) {
    t.skip('没有可用的 bash，跳过远端脚本实测：' + error.message);
    return;
  }
  const pkgDir = await makePackage();
  const remoteDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'hb-remote-'));
  const tarPath = path.join(os.tmpdir(), 'hb-rehearse-' + Date.now() + '.tar.gz');
  const files = collectPackageFiles(pkgDir, JSON.parse(fs.readFileSync(path.join(pkgDir, 'manifest.json'), 'utf8')));
  try {
    await packTarGz({ dir: pkgDir, files, out: tarPath, mtimeSeconds: 1700000000 });
    await fsp.mkdir(path.join(remoteDir, 'incoming'), { recursive: true });
    await fsp.mkdir(path.join(remoteDir, 'deploy'), { recursive: true });
    await fsp.copyFile(tarPath, path.join(remoteDir, 'incoming', DEFAULTS.tarName));
    const options = { ...baseOptions(pkgDir), remoteDir };
    const extract = buildSteps(options, tarPath).find((step) => step.label.includes('远端解包'));
    const script = extract.args[extract.args.length - 1];
    // 远端命令是纯 POSIX sh，本地用 bash 原样执行一遍，验证它真的能解开我们的 tar.gz。
    execFileSync('bash', ['-c', script], { cwd: remoteDir, stdio: 'pipe' });
    for (const rel of ['manifest.json', 'entries.jsonl', 'tables/a.jsonl', 'images/t/aa.webp', 'images/d/aa.webp']) {
      const extracted = path.join(remoteDir, 'deploy', 'import', ...rel.split('/'));
      assert.ok(fs.existsSync(extracted), '解包后缺少 ' + rel);
      assert.ok(fs.readFileSync(extracted).equals(fs.readFileSync(path.join(pkgDir, ...rel.split('/')))), rel + ' 内容不一致');
    }
  } finally {
    await fsp.rm(pkgDir, { recursive: true, force: true });
    await fsp.rm(remoteDir, { recursive: true, force: true });
    await fsp.rm(tarPath, { force: true });
  }
});


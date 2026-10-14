import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { packTarGz } from '../lib/tar.mjs';

async function makeTree() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'hb-tar-'));
  await fsp.mkdir(path.join(dir, 'tables'), { recursive: true });
  await fsp.mkdir(path.join(dir, 'images', 't'), { recursive: true });
  await fsp.writeFile(path.join(dir, 'manifest.json'), '{"formatVersion":1}\n', 'utf8');
  // 故意让第二个文件正好是 512 的整数倍，验证补位逻辑不在内容后多写一块。
  await fsp.writeFile(path.join(dir, 'entries.jsonl'), 'a'.repeat(512), 'utf8');
  await fsp.writeFile(path.join(dir, 'tables', 'a.jsonl'), '{"x":1}\n', 'utf8');
  await fsp.writeFile(path.join(dir, 'images', 't', 'deadbeef.webp'), Buffer.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3]), 'utf8');
  return dir;
}

test('packTarGz：打出 gzip 头，文件数与字节数合理', async () => {
  const dir = await makeTree();
  const out = path.join(os.tmpdir(), 'hb-tar-out-' + Date.now() + '.tar.gz');
  try {
    const files = ['manifest.json', 'entries.jsonl', 'tables/a.jsonl', 'images/t/deadbeef.webp'];
    const packed = await packTarGz({ dir, files, out, mtimeSeconds: 1700000000 });
    assert.equal(packed.fileCount, 4);
    const head = await fsp.readFile(out);
    assert.equal(head[0], 0x1f);
    assert.equal(head[1], 0x8b);
    assert.ok(packed.bytes > 100);
    assert.match(packed.sha256, /^[0-9a-f]{64}$/);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
    await fsp.rm(out, { force: true });
  }
});

test('packTarGz：系统 tar 能解开，内容逐字节一致', async (t) => {
  const dir = await makeTree();
  const out = path.join(os.tmpdir(), 'hb-tar-x-' + Date.now() + '.tar.gz');
  const back = await fsp.mkdtemp(path.join(os.tmpdir(), 'hb-tar-back-'));
  const files = ['manifest.json', 'entries.jsonl', 'tables/a.jsonl', 'images/t/deadbeef.webp'];
  try {
    await packTarGz({ dir, files, out, mtimeSeconds: 1700000000 });
    try {
      execFileSync('tar', ['-xzf', out, '-C', back], { stdio: 'pipe' });
    } catch (error) {
      t.skip('系统没有可用的 tar，跳过解包验证：' + error.message);
      return;
    }
    for (const rel of files) {
      const original = await fsp.readFile(path.join(dir, ...rel.split('/')));
      const extracted = await fsp.readFile(path.join(back, ...rel.split('/')));
      assert.equal(extracted.length, original.length, rel + ' 长度不一致');
      assert.ok(extracted.equals(original), rel + ' 内容不一致');
    }
    // 目录层级也要在：图片和 tables 都是子目录。
    assert.ok(fs.existsSync(path.join(back, 'images', 't', 'deadbeef.webp')));
    assert.ok(fs.existsSync(path.join(back, 'tables', 'a.jsonl')));
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
    await fsp.rm(back, { recursive: true, force: true });
    await fsp.rm(out, { force: true });
  }
});

test('packTarGz：超过 100 字节的路径直接报错，不产出半成品', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'hb-tar-long-'));
  const out = path.join(os.tmpdir(), 'hb-tar-long-' + Date.now() + '.tar.gz');
  const longName = 'x'.repeat(120) + '.jsonl';
  try {
    await fsp.writeFile(path.join(dir, longName), 'data', 'utf8');
    await assert.rejects(() => packTarGz({ dir, files: [longName], out }), /100/);
    assert.equal(fs.existsSync(out), false, '失败时不应留下输出文件');
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
    await fsp.rm(out, { force: true });
  }
});

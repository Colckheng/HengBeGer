/**
 * 纯 Node 的 tar.gz 打包器（ustar 格式）。
 *
 * 为什么不用系统 tar：push-data.mjs 要在 Windows 上打出 Linux 上能解的包，
 * 而 Node 没有内置 tar。自己写这几十行比依赖 `tar.exe` 更可控，也更好测。
 *
 * 只支持普通文件（typeflag '0'），不支持长路径（>100 字节直接报错），
 * 对数据包里的 manifest.json / entries.jsonl / tables/*.jsonl / images/(t|d)/<sha256>.webp 足够。
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { once } from 'node:events';
import { sha256File, toPosixPath } from './package-io.mjs';

const BLOCK = 512;
const END_BLOCKS = Buffer.alloc(BLOCK * 2);

function octal(value, length) {
  const text = value.toString(8);
  if (text.length > length - 1) throw new Error('tar 字段溢出：' + value);
  return text.padStart(length - 1, '0') + '\0';
}

function ustarHeader(name, size, mtimeSeconds) {
  if (Buffer.byteLength(name, 'utf8') > 100) {
    throw new Error('tar 不支持超过 100 字节的路径：' + name);
  }
  const header = Buffer.alloc(BLOCK);
  header.write(name, 0, 100, 'utf8');
  header.write(octal(0o644, 8), 100, 'ascii');
  header.write(octal(0, 8), 108, 'ascii');
  header.write(octal(0, 8), 116, 'ascii');
  header.write(octal(size, 12), 124, 'ascii');
  header.write(octal(mtimeSeconds, 12), 136, 'ascii');
  header.write('        ', 148, 8, 'ascii');
  header.write('0', 156, 1, 'ascii');
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  header.write('root', 265, 32, 'ascii');
  header.write('root', 297, 32, 'ascii');
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return header;
}

/**
 * 把 dir 下的相对路径列表打成 out 处的 .tar.gz。
 * @param {{dir: string, files: string[], out: string, mtimeSeconds?: number, onProgress?: (done: number, total: number) => void}} options
 * @returns {Promise<{out: string, bytes: number, sha256: string, fileCount: number}>}
 */
export async function packTarGz({ dir, files, out, mtimeSeconds, onProgress }) {
  const mtime = Number.isFinite(mtimeSeconds) ? mtimeSeconds : Math.floor(Date.now() / 1000);
  await fsp.mkdir(path.dirname(out), { recursive: true });
  const gzip = zlib.createGzip({ level: 6 });
  const sink = fs.createWriteStream(out);
  gzip.pipe(sink);
  const write = async (buf) => {
    if (!gzip.write(buf)) await once(gzip, 'drain');
  };
  try {
    let done = 0;
    for (const rel of files) {
      const posix = toPosixPath(rel);
      const abs = path.join(dir, posix);
      const stat = await fsp.stat(abs);
      if (!stat.isFile()) throw new Error('不是普通文件，无法打包：' + posix);
      await write(ustarHeader(posix, stat.size, mtime));
      const source = fs.createReadStream(abs, { highWaterMark: 1 << 20 });
      for await (const chunk of source) await write(chunk);
      const pad = (BLOCK - (stat.size % BLOCK)) % BLOCK;
      if (pad > 0) await write(Buffer.alloc(pad));
      done += 1;
      if (onProgress && done % 500 === 0) onProgress(done, files.length);
    }
    await write(END_BLOCKS);
    gzip.end();
    await once(sink, 'close');
  } catch (error) {
    gzip.destroy();
    sink.destroy();
    await fsp.rm(out, { force: true });
    throw error;
  }
  const stat = await fsp.stat(out);
  return { out, bytes: stat.size, sha256: await sha256File(out), fileCount: files.length };
}

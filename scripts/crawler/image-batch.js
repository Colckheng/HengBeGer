import crypto from 'node:crypto';
import path from 'node:path';

export const IMAGE_TARGETS = [
  ['zzz/agents', 'zzz', 43], ['zzz/sound_engines', 'zzz', 45], ['zzz/drive_disks', 'zzz', 46],
  ['zzz/bangboo', 'zzz', 44], ['zzz/enemies', 'zzz', 65], ['hsr/characters', 'hsr', 18],
  ['hsr/light_cones', 'hsr', 19], ['hsr/relics', 'hsr', 30], ['hsr/enemies', 'hsr', 23],
  ...[1, 2].flatMap(season => ['roles', 'traits', 'items', 'strategies', 'environments'].map(kind => [`currency/season${season}/${kind}`, 'hsr', kind === 'roles' ? 18 : null])),
];

export const imageHash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export const imageName = value => String(value || '').normalize('NFKC').replace(/\s+/g, '').trim();

export function imageExtension(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 12 || bytes.length > 20 * 1024 * 1024) throw new Error('invalid image size');
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.length >= 45 && bytes.toString('ascii', 12, 16) === 'IHDR'
    && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0 && bytes.toString('ascii', bytes.length - 8, bytes.length - 4) === 'IEND') return '.png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217) return '.jpg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' && bytes.readUInt32LE(4) + 8 === bytes.length) return '.webp';
  if (/^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6))) return '.gif';
  throw new Error('unsupported or invalid image signature');
}

export function imagePath(root, rel) {
  const base = path.resolve(root, 'data/images');
  const resolved = path.resolve(base, rel);
  if (!resolved.startsWith(`${base}${path.sep}`)) throw new Error(`unsafe image path ${rel}`);
  return resolved;
}

export function chooseImageItem(fm, items, localNameCounts) {
  const bound = fm.source === 'mihoyo-api' && /\/content\/(\d+)(?:\/|$)/.exec(fm.source_url || '')?.[1];
  if (bound) {
    const matches = items.filter(item => String(item.content_id) === bound);
    return matches.length === 1 ? { item: matches[0], match: 'source-url' } : null;
  }
  const name = imageName(fm.name);
  if (!name || localNameCounts.get(name) !== 1) return null;
  const matches = items.filter(item => [item.title, item.alias].some(value => imageName(value) === name));
  return matches.length === 1 ? { item: matches[0], match: 'unique-exact-name' } : null;
}

export function validateImageUrl(url) {
  const parsed = new URL(url);
  const nanoka = parsed.hostname === 'static.nanoka.cc' && /^\/assets\/(hsr|zzz)\//.test(parsed.pathname);
  if (parsed.protocol !== 'https:' || (!nanoka && !/^(?:[^.]+\.)*(?:mihoyo\.com|hoyoverse\.com|hoyolab\.com)$/.test(parsed.hostname))) {
    throw new Error('image URL is not an approved source CDN');
  }
  return url;
}

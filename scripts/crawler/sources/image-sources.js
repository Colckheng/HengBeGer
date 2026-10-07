import { createMihoyoSource } from './mihoyo.js';
import { normalizeName } from '../writer.js';

export const IMAGE_ALIASES = {
  agents: {
    dir: ['zzz/agents'],
    imgDir: 'zzz/agents',
    chain: [{ type: 'mihoyo', game: 'zzz', channel: 43 }, { type: 'bwiki-page', game: 'zzz' }],
  },
  sound_engines: {
    dir: ['zzz/sound_engines'],
    imgDir: 'zzz/sound_engines',
    chain: [{ type: 'mihoyo', game: 'zzz', channel: 45 }],
  },
  drive_disks: {
    dir: ['zzz/drive_disks'],
    imgDir: 'zzz/drive_disks',
    chain: [{ type: 'mihoyo', game: 'zzz', channel: 46 }],
  },
  bangboo: {
    dir: ['zzz/bangboo'],
    imgDir: 'zzz/bangboo',
    chain: [{ type: 'mihoyo', game: 'zzz', channel: 44 }],
  },
  'zzz-enemies': {
    dir: ['zzz/enemies'],
    imgDir: 'zzz/enemies',
    chain: [{ type: 'mihoyo', game: 'zzz', channel: 65 }],
  },
  characters: {
    dir: ['hsr/characters'],
    imgDir: 'hsr/characters',
    chain: [{ type: 'mihoyo', game: 'hsr', channel: 18 }, { type: 'bwiki-list', game: 'sr', page: '角色一览' }],
  },
  light_cones: {
    dir: ['hsr/light_cones'],
    imgDir: 'hsr/light_cones',
    chain: [{ type: 'mihoyo', game: 'hsr', channel: 19 }],
  },
  relics: {
    dir: ['hsr/relics'],
    imgDir: 'hsr/relics',
    chain: [{ type: 'mihoyo', game: 'hsr', channel: 30 }],
  },
  'hsr-enemies': {
    dir: ['hsr/enemies'],
    imgDir: 'hsr/enemies',
    chain: [{ type: 'mihoyo', game: 'hsr', channel: 23 }],
  },
  roles: {
    dir: ['currency/season1/roles', 'currency/season2/roles'],
    imgDir: 'currency/roles',
    chain: [
      { type: 'bwiki-list', game: 'sr', page: '角色一览（货币）' },
      { type: 'mihoyo', game: 'hsr', channel: 18 },
    ],
  },
  traits: {
    dir: ['currency/season1/traits', 'currency/season2/traits'],
    imgDir: 'currency/traits',
    chain: [{ type: 'bwiki-list', game: 'sr', page: '羁绊一览' }],
  },
};

const IMG_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };

export function extFromContentType(ct) {
  const key = String(ct || '').split(';')[0].trim().toLowerCase();
  return IMG_EXT[key] || '';
}

export function extFromUrl(url) {
  const m = /\.(png|jpe?g|webp|gif)(?:$|\?)/i.exec(String(url || ''));
  if (!m) return '';
  const e = m[1].toLowerCase();
  return e === 'jpeg' ? '.jpg' : `.${e}`;
}

export function bwikiOriginal(url) {
  const u = String(url || '');
  if (!u.includes('/thumb/')) return u;
  const dropped = u.replace(/\/[^/]*$/, '');
  return dropped.replace('/thumb/', '/');
}

const BIMAGE_BAD = /图标|徽章|Logo|稀有度|头像|背景|壁纸|阵营图标|元素图标/;

export function pickBwikiImage(html, name) {
  const text = String(html || '');
  let best = null;
  let bestScore = 99;
  for (const m of text.matchAll(/<img\b[^>]*>/g)) {
    const tag = m[0];
    const alt = (/\balt="([^"]*)"/.exec(tag) || [])[1] || '';
    const src = (/\bsrc="([^"]+)"/.exec(tag) || [])[1] || '';
    if (!src || !/\.(png|jpe?g|webp|gif)(?:$|\?|\/)/i.test(src)) continue;
    if (!alt.includes(name)) continue;
    if (BIMAGE_BAD.test(alt)) continue;
    let score = 3;
    if (alt === `${name}.png` || alt === `${name}.jpg`) score = 0;
    else if (alt.includes(`立绘-${name}`)) score = 1;
    if (score < bestScore) {
      bestScore = score;
      best = src;
    }
  }
  return best ? bwikiOriginal(best) : '';
}

export function pickMihoyoListItem(items, name) {
  const t = normalizeName(name);
  if (!t) return null;
  const list = Array.isArray(items) ? items : [];
  const norm = (v) => normalizeName(v);
  for (const item of list) {
    if (norm(item.title) === t || norm(item.alias) === t) return item;
  }
  for (const item of list) {
    const title = norm(item.title);
    if (title && t.startsWith(title)) return item;
  }
  for (const item of list) {
    const title = norm(item.title);
    if (title && (title.includes(t) || t.includes(title))) return item;
  }
  return null;
}

export function setImageFm(raw, relPath) {
  const text = String(raw || '');
  const value = JSON.stringify(String(relPath));
  if (/^image:.*$/m.test(text)) return text.replace(/^image:.*$/m, `image: ${value}`);
  const fmStart = text.startsWith('---\n') ? 4 : 0;
  const fmEnd = text.indexOf('\n---', fmStart);
  if (fmStart === 0 || fmEnd === -1) throw new Error('缺少 front-matter 块，无法写入 image');
  return `${text.slice(0, fmEnd + 1)}image: ${value}\n${text.slice(fmEnd + 1)}`;
}

function bwikiUrl(game, page) {
  return `https://wiki.biligame.com/${game}/${encodeURIComponent(page)}`;
}

export function createImageResolvers({ listFetcher, wikiFetcher }) {
  const mihoyo = createMihoyoSource(listFetcher);
  const listCache = new Map();
  const wikiCache = new Map();

  async function loadList(game, channel) {
    const key = `${game}/${channel}`;
    if (!listCache.has(key)) listCache.set(key, await mihoyo.listChannel(game, channel));
    return listCache.get(key);
  }

  async function loadWiki(url) {
    if (!wikiCache.has(url)) {
      const html = await wikiFetcher.getText(url, { headers: { Referer: 'https://wiki.biligame.com/' } });
      wikiCache.set(url, html);
    }
    return wikiCache.get(url);
  }

  async function stepUrls(step, name) {
    if (step.type === 'mihoyo') {
      const items = await loadList(step.game, step.channel);
      const item = pickMihoyoListItem(items, name);
      if (!item) return [];
      const urls = [];
      if (item.icon) urls.push(item.icon);
      if (Array.isArray(item.picture)) urls.push(...item.picture.filter(Boolean));
      return [...new Set(urls)];
    }
    if (step.type === 'bwiki-list') {
      const html = await loadWiki(bwikiUrl(step.game, step.page));
      const u = pickBwikiImage(html, name);
      return u ? [u] : [];
    }
    if (step.type === 'bwiki-page') {
      const html = await loadWiki(bwikiUrl(step.game, name));
      const u = pickBwikiImage(html, name);
      return u ? [u] : [];
    }
    return [];
  }

  async function* candidateSteps(alias, name) {
    const cfg = IMAGE_ALIASES[alias];
    if (!cfg) throw new Error(`未知图片目标类型 ${alias}`);
    for (const step of cfg.chain) {
      let urls = [];
      let error = null;
      try {
        urls = await stepUrls(step, name);
      } catch (e) {
        error = e;
      }
      yield { step, urls, error };
    }
  }

  return { candidateSteps, loadList, loadWiki };
}

export default createImageResolvers;
